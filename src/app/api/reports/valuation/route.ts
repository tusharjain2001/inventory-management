import { db } from "@/lib/db";
import { handler, spBool, spInt } from "@/lib/http";
import { round2, round3 } from "@/lib/calc";
import { getSettingsGroup } from "@/lib/settings";
import { num, pct, REPORT_ROW_CAP } from "@/lib/reports";

/**
 * Inventory valuation at weighted-average cost. Units = showroom + on display (owned stock).
 * ?categoryId &subCategoryId &zero=true (include products with no stock)
 */
export const GET = handler({ permission: "reports.valuation" }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const includeZero = spBool(sp, "zero") === true;
  const [products, inventory] = await Promise.all([
    db.product.findMany({
      where: {
        deletedAt: null,
        ...(spInt(sp, "categoryId") ? { categoryId: spInt(sp, "categoryId") } : {}),
        ...(spInt(sp, "subCategoryId") ? { subCategoryId: spInt(sp, "subCategoryId") } : {}),
      },
      orderBy: { name: "asc" },
      take: REPORT_ROW_CAP,
      select: {
        id: true,
        name: true,
        sku: true,
        isActive: true,
        currentStock: true,
        onDisplayStock: true,
        avgCost: true,
        category: { select: { id: true, name: true } },
        subCategory: { select: { name: true } },
      },
    }),
    getSettingsGroup("inventory"),
  ]);

  const all = products.map((p) => {
    const currentStock = num(p.currentStock);
    const onDisplayStock = num(p.onDisplayStock);
    const units = round3(currentStock + onDisplayStock);
    const avgCost = num(p.avgCost);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      isActive: p.isActive,
      categoryId: p.category.id,
      category: p.category.name,
      subCategory: p.subCategory?.name ?? "",
      currentStock,
      onDisplayStock,
      units,
      avgCost,
      value: round2(units * avgCost),
      sharePct: 0,
    };
  });
  const rows = includeZero ? all : all.filter((r) => r.units !== 0);
  const totalValue = round2(rows.reduce((s, r) => s + r.value, 0));
  const totalUnits = round3(rows.reduce((s, r) => s + r.units, 0));
  rows.forEach((r) => (r.sharePct = pct(r.value, totalValue)));
  rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const catMap = new Map<number, { id: number; name: string; products: number; currentStock: number; onDisplayStock: number; units: number; value: number }>();
  for (const r of rows) {
    const c = catMap.get(r.categoryId) ?? { id: r.categoryId, name: r.category, products: 0, currentStock: 0, onDisplayStock: 0, units: 0, value: 0 };
    c.products += 1;
    c.currentStock = round3(c.currentStock + r.currentStock);
    c.onDisplayStock = round3(c.onDisplayStock + r.onDisplayStock);
    c.units = round3(c.units + r.units);
    c.value = round2(c.value + r.value);
    catMap.set(r.categoryId, c);
  }
  const categories = [...catMap.values()]
    .map((c) => ({ ...c, avgCost: c.units ? round2(c.value / c.units) : 0, sharePct: pct(c.value, totalValue) }))
    .sort((a, b) => b.value - a.value);

  return {
    rows,
    categories,
    totals: {
      products: rows.length,
      currentStock: round3(rows.reduce((s, r) => s + r.currentStock, 0)),
      onDisplayStock: round3(rows.reduce((s, r) => s + r.onDisplayStock, 0)),
      units: totalUnits,
      value: totalValue,
    },
    meta: { costingMethod: inventory.costingMethod, asOf: new Date() },
  };
});
