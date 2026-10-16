import { db, transaction } from "@/lib/db";
import { AppError, body, handler, intParam } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { ADMIN_ROLE_KEY } from "@/lib/permissions";
import { roleSchema } from "../_lib";

export const GET = handler<{ id: string }>({ permission: ["roles.manage", "users.view"] }, async ({ params }) => {
  const id = intParam(params.id);
  const role = await db.role.findUniqueOrThrow({
    where: { id },
    include: {
      _count: { select: { users: true } },
      users: { orderBy: { name: "asc" }, select: { id: true, name: true, email: true, isActive: true } },
    },
  });
  const { _count, ...r } = role;
  return { ...r, userCount: _count.users };
});

export const PATCH = handler<{ id: string }>({ permission: "roles.manage" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, roleSchema);
  return transaction(async (tx) => {
    const before = await tx.role.findUniqueOrThrow({ where: { id } });
    // The Admin role always has every permission (including ones added later).
    const data = before.key === ADMIN_ROLE_KEY ? { ...input, permissions: before.permissions } : input;
    const updated = await tx.role.update({ where: { id }, data });
    const d = diff(before, data);
    if (d.changed) {
      // Log permission changes as added/removed lists rather than two long arrays.
      const added = data.permissions.filter((p) => !before.permissions.includes(p));
      const removed = before.permissions.filter((p) => !data.permissions.includes(p));
      if (d.after.permissions !== undefined) {
        delete d.before.permissions;
        delete d.after.permissions;
        if (added.length) d.after.permissionsAdded = added;
        if (removed.length) d.before.permissionsRemoved = removed;
      }
      await audit(tx, {
        userId: user.id,
        action: "UPDATE",
        entity: "Role",
        entityId: id,
        summary: `Updated role ${updated.name}${added.length || removed.length ? ` (+${added.length} / -${removed.length} permissions)` : ""}`,
        before: d.before,
        after: d.after,
        ip,
      });
    }
    return updated;
  });
});

export const DELETE = handler<{ id: string }>({ permission: "roles.manage" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  const role = await db.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
  if (role.isSystem) throw new AppError(400, "Built-in roles cannot be deleted");
  if (role._count.users > 0) {
    throw new AppError(409, `${role.name} is assigned to ${role._count.users} user(s). Move them to another role first.`);
  }
  await transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await audit(tx, { userId: user.id, action: "DELETE", entity: "Role", entityId: id, summary: `Deleted role ${role.name}`, before: role, ip });
  });
  return { ok: true };
});
