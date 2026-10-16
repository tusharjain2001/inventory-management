import { z } from "zod";
import { db } from "@/lib/db";
import { body, clientIp, publicHandler, AppError } from "@/lib/http";
import { createSession, verifyPassword } from "@/lib/auth";
import { getSettingsGroup } from "@/lib/settings";
import { audit } from "@/lib/audit";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username"),
  password: z.string().min(1, "Enter your password"),
  rememberMe: z.boolean().optional().default(false),
});

export const POST = publicHandler(async (req) => {
  const { identifier, password, rememberMe } = await body(req, schema);
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent");
  const id = identifier.toLowerCase();
  const security = await getSettingsGroup("security");

  const user = await db.user.findFirst({
    where: {
      OR: [{ email: { equals: id, mode: "insensitive" } }, { username: { equals: id, mode: "insensitive" } }],
    },
  });

  const logAttempt = (success: boolean, reason?: string) =>
    db.loginActivity.create({
      data: { userId: user?.id ?? null, identifier: id, success, reason, ip, userAgent: userAgent?.slice(0, 300) },
    });

  if (!user) {
    await logAttempt(false, "Unknown user");
    throw new AppError(401, "Incorrect email/username or password");
  }
  if (!user.isActive) {
    await logAttempt(false, "Inactive user");
    throw new AppError(403, "This account is disabled. Contact your administrator.");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logAttempt(false, "Locked");
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError(423, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= security.maxFailedAttempts;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + security.lockoutMinutes * 60_000) : null,
      },
    });
    await logAttempt(false, lock ? "Wrong password, account locked" : "Wrong password");
    if (lock) {
      throw new AppError(423, `Too many failed attempts. Account locked for ${security.lockoutMinutes} minutes.`);
    }
    const left = security.maxFailedAttempts - failed;
    throw new AppError(401, `Incorrect email/username or password (${left} attempt${left === 1 ? "" : "s"} left)`);
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await logAttempt(true);
  await audit(db, { userId: user.id, action: "LOGIN", entity: "User", entityId: user.id, summary: `${user.name} signed in`, ip });
  await createSession(user.id, rememberMe, ip, userAgent);
  return { ok: true };
});
