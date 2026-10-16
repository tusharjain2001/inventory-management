import { transaction } from "@/lib/db";
import { handler, intParam } from "@/lib/http";
import { audit } from "@/lib/audit";

/** Clears a lockout caused by too many failed sign-in attempts. */
export const POST = handler<{ id: string }>({ permission: "users.manage" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  return transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id }, select: { name: true, lockedUntil: true, failedLoginCount: true } });
    await tx.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } });
    await audit(tx, {
      userId: user.id,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      summary: `Unlocked user ${before.name}`,
      before: { lockedUntil: before.lockedUntil, failedLoginCount: before.failedLoginCount },
      after: { lockedUntil: null, failedLoginCount: 0 },
      ip,
    });
    return { ok: true };
  });
});
