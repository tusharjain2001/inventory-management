import { db } from "@/lib/db";
import { handler, spInt } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";
import { round2, round3 } from "@/lib/calc";
import { getSettingsGroup } from "@/lib/settings";
import { deadStockRows } from "@/lib/reports";

/**
 * Products with stock (showroom + display) and no sale on an ACTIVE invoice for at least N days.
 * ?days (default Settings → Analysis → dead stock days) &categoryId &subCategoryId &supplierId
 */
export const GET = handler({ permission: "reports.valuation" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const analysis = await getSettingsGroup("analysis");
  const days = Math.min(3650, Math.max(1, Math.floor(spInt(sp, "days") ?? analysis.deadStockDays)));
  const showCost = hasPermission(user, "products.viewCost");

  const list = await deadStockRows(db, {
    days,
    categoryId: spInt(sp, "categoryId"),
    subCategoryId: spInt(sp, "subCategoryId"),
    supplierId: spInt(sp, "supplierId"),
  });
  const rows = list.map((r) => (showCost ? r : { ...r, avgCost: undefined, stockValue: undefined }));

  const totals = {
    products: rows.length,
    currentStock: round3(list.reduce((s, r) => s + r.currentStock, 0)),
    onDisplayStock: round3(list.reduce((s, r) => s + r.onDisplayStock, 0)),
    ownedStock: round3(list.reduce((s, r) => s + r.ownedStock, 0)),
    neverSold: list.filter((r) => !r.lastSaleAt).length,
    ...(showCost ? { stockValue: round2(list.reduce((s, r) => s + r.stockValue, 0)) } : {}),
  };
  return { rows, totals, meta: { days, defaultDays: analysis.deadStockDays, showCost } };
});
