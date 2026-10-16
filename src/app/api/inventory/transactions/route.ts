import { db, type Prisma } from "@/lib/db";
import { handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";
import { STOCK_TXN_TYPES } from "@/app/(app)/inventory/constants";
import { spEnum } from "../shared";

/**
 * Stock ledger across all products, newest first.
 * ?productId &type &from&to &createdById &q= (product name/SKU, reference no)
 */
export const GET = handler({ permission: "inventory.view" }, async ({ req, user }) => {
  const lq = listQuery(req, ["txnDate", "quantity"]);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const type = spEnum(sp, "type", STOCK_TXN_TYPES);
  const where: Prisma.InventoryTransactionWhereInput = {
    ...(range ? { txnDate: range } : {}),
    ...(type ? { type } : {}),
    ...(spInt(sp, "productId") ? { productId: spInt(sp, "productId") } : {}),
    ...(spInt(sp, "createdById") ? { createdById: spInt(sp, "createdById") } : {}),
    ...(lq.q
      ? {
          OR: [
            { refNo: { contains: lq.q, mode: "insensitive" } },
            { product: { name: { contains: lq.q, mode: "insensitive" } } },
            { product: { sku: { contains: lq.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.inventoryTransaction.findMany({
      where,
      orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }, { id: "desc" }] : [{ txnDate: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { id: true, name: true } },
      },
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
