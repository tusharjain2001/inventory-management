import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, body, handler } from "@/lib/http";
import { hashPassword, isStrongEnough, PASSWORD_RULE, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().refine(isStrongEnough, PASSWORD_RULE),
});

export const POST = handler({}, async ({ req, user, ip }) => {
  const { currentPassword, newPassword } = await body(req, schema);
  const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(currentPassword, record.passwordHash))) {
    throw new AppError(400, "Current password is incorrect", { currentPassword: ["Current password is incorrect"] });
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });
  await audit(db, { userId: user.id, action: "PASSWORD", entity: "User", entityId: user.id, summary: "Changed own password", ip });
  return { ok: true };
});
