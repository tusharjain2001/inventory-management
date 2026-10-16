import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, body, publicHandler } from "@/lib/http";
import { hashPassword, isStrongEnough, PASSWORD_RULE, revokeAllSessions, sha256 } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({ token: z.string().min(10), password: z.string().refine(isStrongEnough, PASSWORD_RULE) });

export const POST = publicHandler(async (req) => {
  const { token, password } = await body(req, schema);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, "This reset link is invalid or has expired. Please request a new one.");
  }
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeAllSessions(record.userId);
  await audit(db, {
    userId: record.userId,
    action: "PASSWORD",
    entity: "User",
    entityId: record.userId,
    summary: "Password reset via email link",
  });
  return { ok: true };
});
