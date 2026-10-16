import { db, transaction, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged, spInt } from "@/lib/http";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { assertCanManageAdmin, assertUnique, userCreateSchema, userSelect, withLock } from "./_lib";

/** ?q= (name/email/username/phone) &roleId &active=true|false|all (default all) &sort=name|email|lastLoginAt|createdAt:dir */
export const GET = handler({ permission: "users.view" }, async ({ req }) => {
  const lq = listQuery(req, ["name", "email", "lastLoginAt", "createdAt"]);
  const active = lq.sp.get("active") ?? "all";
  const roleId = spInt(lq.sp, "roleId");
  const where: Prisma.UserWhereInput = {
    ...(active === "all" ? {} : { isActive: active === "true" }),
    ...(roleId ? { roleId } : {}),
    ...(lq.q
      ? {
          OR: [
            { name: { contains: lq.q, mode: "insensitive" } },
            { email: { contains: lq.q, mode: "insensitive" } },
            { username: { contains: lq.q, mode: "insensitive" } },
            { phone: { contains: lq.q } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      select: userSelect,
      orderBy: lq.sort ? { [lq.sort.field]: lq.sort.dir } : { name: "asc" },
      skip: lq.skip,
      take: lq.take,
    }),
    db.user.count({ where }),
  ]);
  return paged(rows.map(withLock), total, lq);
});

export const POST = handler({ permission: "users.manage" }, async ({ req, user, ip }) => {
  const { password, ...input } = await body(req, userCreateSchema);
  const role = await db.role.findUniqueOrThrow({ where: { id: input.roleId } });
  assertCanManageAdmin(user, role.key);
  await assertUnique(db, input);
  const passwordHash = await hashPassword(password);
  return transaction(async (tx) => {
    const created = await tx.user.create({
      data: { ...input, passwordHash, passwordChangedAt: new Date() },
      select: userSelect,
    });
    await audit(tx, {
      userId: user.id,
      action: "CREATE",
      entity: "User",
      entityId: created.id,
      summary: `Created user ${created.name} (${created.email}) as ${role.name}`,
      after: { ...input, role: role.name },
      ip,
    });
    return withLock(created);
  });
});
