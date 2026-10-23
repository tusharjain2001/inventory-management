import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";

type Row = {
  showroom: unknown;
  on_display: unknown;
  skus: unknown;
  stock_value: unknown;
  in_stock: unknown;
  low: unknown;
  out_of_stock: unknown;
  negative: unknown;
};

/** KPI figures for the stock overview. Active, non-deleted products only. */
export const GET = handler({ permission: "inventory.view" }, async ({ user }) => {
  // Raw SQL because Prisma cannot compare two columns inside an aggregate (stock vs reorder level).
  const [[row], openDisplays, pendingAdjustments] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT
        COALESCE(SUM("currentStock"), 0)                                          AS showroom,
        COALESCE(SUM("onDisplayStock"), 0)                                        AS on_display,
        COUNT(*)                                                                  AS skus,
        COALESCE(SUM(("currentStock" + "onDisplayStock") * "avgCost"), 0)         AS stock_value,
        COUNT(*) FILTER (WHERE "currentStock" > 0 AND "currentStock" > "reorderLevel")  AS in_stock,
        COUNT(*) FILTER (WHERE "currentStock" > 0 AND "currentStock" <= "reorderLevel") AS low,
        COUNT(*) FILTER (WHERE "currentStock" = 0)                                AS out_of_stock,
        COUNT(*) FILTER (WHERE "currentStock" < 0)                                AS negative
      FROM "Product"
      WHERE "deletedAt" IS NULL AND "isActive" = true`,
    db.displayIssue.count({ where: { status: { in: ["OUT", "PARTIAL"] } } }),
    db.stockAdjustment.count({ where: { status: "PENDING" } }),
  ]);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    unitsInShowroom: n(row.showroom),
    unitsOnDisplay: n(row.on_display),
    activeSkus: n(row.skus),
    stockValue: hasPermission(user, "products.viewCost") ? Math.round(n(row.stock_value) * 100) / 100 : null,
    inStock: n(row.in_stock),
    lowStock: n(row.low),
    outOfStock: n(row.out_of_stock),
    negativeStock: n(row.negative),
    openDisplays,
    pendingAdjustments,
  };
});
