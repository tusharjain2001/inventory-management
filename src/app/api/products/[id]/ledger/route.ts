import { db, type Prisma } from "@/lib/db";
import { handler, intParam, listQuery, paged, spDateRange } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";

/** Stock movements of one product, newest first. ?from&to (YYYY-MM-DD) &type */
export const GET = handler<{ id: string }>({ permission: "inventory.view" }, async ({ req, params, user }) => {
  const productId = intParam(params.id);
  const lq = listQuery(req);
  const range = spDateRange(lq.sp);
  const type = lq.sp.get("type");
  const where: Prisma.InventoryTransactionWhereInput = {
    productId,
    ...(range ? { txnDate: range } : {}),
    ...(type ? { type: type as Prisma.InventoryTransactionWhereInput["type"] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.inventoryTransaction.findMany({
      where,
      orderBy: [{ txnDate: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: { createdBy: { select: { name: true } } },
    }),
    db.inventoryTransaction.count({ where }),
  ]);
  const showCost = hasPermission(user, "products.viewCost");
  return paged(
    rows.map((r) => (showCost ? r : { ...r, unitCost: undefined, totalCost: undefined })),
    total,
    lq,
  );
});
