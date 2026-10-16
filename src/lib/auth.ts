import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSettingsGroup } from "@/lib/settings";
import type { SessionUser } from "@/lib/permissions";

export const SESSION_COOKIE = "sr_session";
const ABSOLUTE_SESSION_HOURS = 12;
const TOUCH_INTERVAL_MS = 60_000;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export { hashPassword, verifyPassword, PASSWORD_RULE, isStrongEnough } from "@/lib/password";

export async function createSession(userId: number, rememberMe: boolean, ip: string | null, userAgent: string | null) {
  const security = await getSettingsGroup("security");
  const token = newToken();
  const expiresAt = rememberMe
    ? new Date(Date.now() + security.rememberMeDays * 86_400_000)
    : new Date(Date.now() + ABSOLUTE_SESSION_HOURS * 3_600_000);
  await db.session.create({
    data: { id: sha256(token), userId, rememberMe, ip, userAgent: userAgent?.slice(0, 300), expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Without "remember me" the cookie ends with the browser session.
    ...(rememberMe ? { expires: expiresAt } : {}),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { id: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Returns the signed-in user, or null if there is no valid session (expired, idle, revoked, inactive). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { role: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) return null;

  const now = Date.now();
  if (!session.rememberMe) {
    const security = await getSettingsGroup("security");
    if (now - session.lastSeenAt.getTime() > security.sessionTimeoutMinutes * 60_000) {
      await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return null;
    }
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    roleKey: user.role.key,
    roleName: user.role.name,
    permissions: user.role.permissions,
    maxDiscountPercent: user.role.maxDiscountPercent.toNumber(),
  };
}

export async function revokeAllSessions(userId: number) {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
