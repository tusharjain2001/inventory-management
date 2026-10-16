import { db, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged } from "@/lib/http";
import { audit } from "@/lib/audit";
import { supplierSchema } from "@/lib/validators";
import { stateCodeFromGstin, stateByCode } from "@/lib/india";

/** ?q= &active=true|false|all (default true) */
export const GET = handler({ permission: ["suppliers.view", "inventory.stockIn"] }, async ({ req }) => {
  const lq = listQuery(req, ["name", "city", "createdAt"]);
  const active = lq.sp.get("active") ?? "true";
  const where: Prisma.SupplierWhereInput = {
    ...(active === "all" ? {} : { isActive: active === "true" }),
    ...(lq.q
      ? {
          OR: [
            { name: { contains: lq.q, mode: "insensitive" } },
            { phone: { contains: lq.q } },
            { gstin: { contains: lq.q, mode: "insensitive" } },
            { contactPerson: { contains: lq.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy: lq.sort ? { [lq.sort.field]: lq.sort.dir } : { name: "asc" },
      skip: lq.skip,
      take: lq.take,
      include: { _count: { select: { stockIns: true } } },
    }),
    db.supplier.count({ where }),
  ]);
  return paged(rows, total, lq);
});

export const POST = handler({ permission: "suppliers.manage" }, async ({ req, user, ip }) => {
  const input = await body(req, supplierSchema);
  const stateCode = input.stateCode ?? stateCodeFromGstin(input.gstin) ?? null;
  const created = await db.supplier.create({
    data: { ...input, stateCode, state: input.state ?? stateByCode(stateCode)?.name ?? null },
  });
  await audit(db, { userId: user.id, action: "CREATE", entity: "Supplier", entityId: created.id, summary: `Created supplier ${created.name}`, after: created, ip });
  return created;
});
