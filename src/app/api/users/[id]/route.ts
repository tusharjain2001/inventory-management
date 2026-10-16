import { db, transaction } from "@/lib/db";
import { AppError, body, handler, intParam } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/auth";
import { ADMIN_ROLE_KEY } from "@/lib/permissions";
import { assertCanManageAdmin, assertNotLastAdmin, assertUnique, userSelect, userUpdateSchema, withLock } from "../_lib";

export const GET = handler<{ id: string }>({ permission: "users.view" }, async ({ params }) => {
  const id = intParam(params.id);
  const u = await db.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  return withLock(u);
});

export const PATCH = handler<{ id: string }>({ permission: "users.manage" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, userUpdateSchema);
  const updated = await transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id }, include: { role: true } });
    const role = await tx.role.findUniqueOrThrow({ where: { id: input.roleId } });
    assertCanManageAdmin(user, before.role.key);
    assertCanManageAdmin(user, role.key);
    await assertUnique(tx, input, id);

    if (id === user.id) {
      if (!input.isActive) throw new AppError(400, "You cannot deactivate your own account");
      if (input.roleId !== before.roleId) throw new AppError(400, "You cannot change your own role. Ask another admin.");
    }
    const wasActiveAdmin = before.role.key === ADMIN_ROLE_KEY && before.isActive;
    const staysActiveAdmin = role.key === ADMIN_ROLE_KEY && input.isActive;
    if (wasActiveAdmin && !staysActiveAdmin) {
      await assertNotLastAdmin(tx, id, "This is the only active Admin. Make another user an Admin first.");
    }

    const after = await tx.user.update({ where: { id }, data: input, select: userSelect });
    const d = diff(before, input);
    if (d.changed) {
      if (d.before.roleId !== undefined) {
        d.before.role = before.role.name;
        d.after.role = role.name;
      }
      await audit(tx, {
        userId: user.id,
        action: "UPDATE",
        entity: "User",
        entityId: id,
        summary: `Updated user ${after.name}`,
        before: d.before,
        after: d.after,
        ip,
      });
    }
    return { after, deactivated: before.isActive && !input.isActive };
  });
  // Sign the user out everywhere when the account is switched off.
  if (updated.deactivated) await revokeAllSessions(id);
  return withLock(updated.after);
});

export const DELETE = handler<{ id: string }>({ permission: "users.delete" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  if (id === user.id) throw new AppError(400, "You cannot delete your own account");
  await transaction(async (tx) => {
    const target = await tx.user.findUniqueOrThrow({
      where: { id },
      include: {
        role: true,
        _count: {
          select: {
            auditLogs: true,
            ordersAsSalesperson: true,
            ordersCreated: true,
            invoicesCreated: true,
            paymentsCreated: true,
            paymentsReceived: true,
            creditNotesCreated: true,
            stockIns: true,
            inventoryTxns: true,
            adjustmentsCreated: true,
            adjustmentsApproved: true,
            lossesCreated: true,
            lossesApproved: true,
            displaysCreated: true,
            customersCreated: true,
            createdProducts: true,
          },
        },
      },
    });
    assertCanManageAdmin(user, target.role.key);
    if (target.role.key === ADMIN_ROLE_KEY && target.isActive) {
      await assertNotLastAdmin(tx, id, "This is the only active Admin and cannot be deleted");
    }
    const history = Object.values(target._count).reduce((s, n) => s + n, 0);
    if (history > 0) {
      throw new AppError(409, `${target.name} has activity on record (orders, stock entries or audit log). Deactivate the user instead.`);
    }
    await tx.user.delete({ where: { id } });
    await audit(tx, {
      userId: user.id,
      action: "DELETE",
      entity: "User",
      entityId: id,
      summary: `Deleted user ${target.name} (${target.email})`,
      before: { name: target.name, email: target.email, username: target.username, role: target.role.name },
      ip,
    });
  });
  return { ok: true };
});
