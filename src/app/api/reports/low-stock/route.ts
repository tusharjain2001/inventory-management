import { db, type Prisma } from "@/lib/db";
import { badRequest, handler, spInt } from "@/lib/http";
import { stockStatus, round3 } from "@/lib/calc";
import { num, REPORT_ROW_CAP } from "@/lib/reports";

/**
 * Active products at or below their reorder level.
 * ?level=all (≤ reorder level, default) | low (0 < stock ≤ reorder) | out (stock ≤ 0)
 * &categoryId &subCategoryId &supplierId (preferred supplier)
 */
export const GET = handler({ permission: "reports.stock" }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const level = sp.get("level") || "all";
  if (!["all", "low", "out"].includes(level)) throw badRequest("Invalid stock level");
  const f = db.product.fields;
  const levelWhere: Prisma.ProductWhereInput =
    level === "out"
      ? { currentStock: { lte: 0 } }
      : level === "low"
        ? { currentStock: { gt: 0, lte: f.reorderLevel } }
        : { currentStock: { lte: f.reorderLevel } };

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...levelWhere,
      ...(spInt(sp, "categoryId") ? { categoryId: spInt(sp, "categoryId") } : {}),
      ...(spInt(sp, "subCategoryId") ? { subCategoryId: spInt(sp, "subCategoryId") } : {}),
      ...(spInt(sp, "supplierId") ? { preferredSupplierId: spInt(sp, "supplierId") } : {}),
    },
    orderBy: [{ currentStock: "asc" }, { name: "asc" }],
    take: REPORT_ROW_CAP,
    select: {
      id: true,
      name: true,
      sku: true,
      currentStock: true,
      onDisplayStock: true,
      reorderLevel: true,
      reorderQuantity: true,
      lastPurchaseAt: true,
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      preferredSupplier: { select: { id: true, name: true } },
    },
  });

  const rows = products.map((p) => {
    const currentStock = num(p.currentStock);
    const reorderLevel = num(p.reorderLevel);
    const reorderQuantity = num(p.reorderQuantity);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.subCategory ? `${p.category.name} › ${p.subCategory.name}` : p.category.name,
      currentStock,
      onDisplayStock: num(p.onDisplayStock),
      reorderLevel,
      reorderQuantity,
      /** Reorder quantity, or enough to get back above the reorder level when none is set. */
      suggestedOrder: reorderQuantity > 0 ? reorderQuantity : round3(Math.max(0, reorderLevel - currentStock + 1)),
      lastPurchaseAt: p.lastPurchaseAt,
      supplier: p.preferredSupplier?.name ?? "",
      status: stockStatus(currentStock, reorderLevel),
    };
  });

  const totals = {
    products: rows.length,
    out: rows.filter((r) => r.currentStock <= 0).length,
    low: rows.filter((r) => r.currentStock > 0).length,
    suggestedOrder: round3(rows.reduce((s, r) => s + r.suggestedOrder, 0)),
  };
  return { rows, totals, meta: { level } };
});
