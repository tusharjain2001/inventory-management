import { db, transaction } from "@/lib/db";
import { body, handler } from "@/lib/http";
import { audit } from "@/lib/audit";
import { roleKeyFromName, roleSchema } from "./_lib";

/** All roles with user counts (also used for the role dropdown on the users page). */
export const GET = handler({ permission: ["roles.manage", "users.view"] }, async () => {
  const rows = await db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { id: "asc" }],
    include: {
      _count: { select: { users: true } },
    },
  });
  const active = await db.user.groupBy({ by: ["roleId"], where: { isActive: true }, _count: { _all: true } });
  const activeByRole = new Map(active.map((a) => [a.roleId, a._count._all]));
  const data = rows.map(({ _count, ...r }) => ({ ...r, userCount: _count.users, activeUserCount: activeByRole.get(r.id) ?? 0 }));
  return { data, total: data.length, page: 1, pageSize: data.length };
});

export const POST = handler({ permission: "roles.manage" }, async ({ req, user, ip }) => {
  const input = await body(req, roleSchema);
  return transaction(async (tx) => {
    const base = roleKeyFromName(input.name);
    let key = base;
    for (let i = 2; await tx.role.findUnique({ where: { key } }); i++) key = `${base}_${i}`;
    const created = await tx.role.create({ data: { ...input, key, isSystem: false } });
    await audit(tx, {
      userId: user.id,
      action: "CREATE",
      entity: "Role",
      entityId: created.id,
      summary: `Created role ${created.name}`,
      after: created,
      ip,
    });
    return created;
  });
});
