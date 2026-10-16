import { db, transaction } from "@/lib/db";
import { body, handler, intParam } from "@/lib/http";
import { audit } from "@/lib/audit";
import { hashPassword, revokeAllSessions } from "@/lib/auth";
import { assertCanManageAdmin, passwordSchema } from "../../_lib";

/** Admin sets a new password for a user; all of that user's sessions are signed out. */
export const POST = handler<{ id: string }>({ permission: "users.manage" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const { password } = await body(req, passwordSchema);
  const target = await db.user.findUniqueOrThrow({ where: { id }, include: { role: true } });
  assertCanManageAdmin(user, target.role.key);
  const passwordHash = await hashPassword(password);
  await transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await audit(tx, {
      userId: user.id,
      action: "PASSWORD",
      entity: "User",
      entityId: id,
      summary: `Reset password for ${target.name}`,
      ip,
    });
  });
  await revokeAllSessions(id);
  return { ok: true };
});
