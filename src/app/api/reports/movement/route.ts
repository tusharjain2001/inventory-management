import { db } from "@/lib/db";
import { badRequest, handler, spInt } from "@/lib/http";
import { round2, round3 } from "@/lib/calc";
import { addDays, istDateString, startOfDayIST, todayIST } from "@/lib/dates";
import { getSettingsGroup } from "@/lib/settings";
import { num, REPORT_ROW_CAP } from "@/lib/reports";

const CLASSES = ["FAST", "NORMAL", "SLOW"] as const;

/**
 * Fast / slow moving items. Velocity = units sold (ACTIVE invoices) in the last `days` days ÷ days.
 * FAST ≥ fast threshold, SLOW ≤ slow threshold (includes zero), else NORMAL.
 * ?days &fast &slow (default from Settings → Analysis) &class=FAST|NORMAL|SLOW &categoryId &subCategoryId
 */
export const GET = handler({ permission: "reports.stock" }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const analysis = await getSettingsGroup("analysis");
  const days = Math.min(3650, Math.max(1, Math.floor(spInt(sp, "days") ?? analysis.analysisPeriodDays)));
  const fast = spInt(sp, "fast") ?? analysis.fastMovingThreshold;
  const slow = spInt(sp, "slow") ?? analysis.slowMovingThreshold;
  if (fast < 0 || slow < 0) throw badRequest("Thresholds cannot be negative");
  const cls = sp.get("class");
  if (cls && !CLASSES.includes(cls as (typeof CLASSES)[number])) throw badRequest("Invalid class");

  // The last `days` IST days including today.
  const from = istDateString(addDays(new Date(`${todayIST()}T12:00:00+05:30`), -(days - 1)));
  const since = startOfDayIST(from);

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(spInt(sp, "categoryId") ? { categoryId: spInt(sp, "categoryId") } : {}),
      ...(spInt(sp, "subCategoryId") ? { subCategoryId: spInt(sp, "subCategoryId") } : {}),
    },
    orderBy: { name: "asc" },
    take: REPORT_ROW_CAP,
    select: {
      id: true,
      name: true,
      sku: true,
      currentStock: true,
      onDisplayStock: true,
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
    },
  });

  const sold = await db.$queryRaw<{ productId: number; units: number }[]>`
    SELECT si."productId", SUM(si.quantity)::float8 AS units
    FROM "SalesOrderItem" si JOIN "Invoice" i ON i."orderId" = si."orderId"
    WHERE i.status = 'ACTIVE' AND i."invoiceDate" >= ${since}
    GROUP BY si."productId"`;
  const unitsBy = new Map(sold.map((s) => [s.productId, s.units]));

  const all = products.map((p) => {
    const units = round3(unitsBy.get(p.id) ?? 0);
    const velocity = round2(units / days);
    const exact = units / days;
    const currentStock = num(p.currentStock);
    const klass = exact >= fast ? "FAST" : exact <= slow ? "SLOW" : "NORMAL";
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.subCategory ? `${p.category.name} › ${p.subCategory.name}` : p.category.name,
      unitsSold: units,
      days,
      velocity,
      currentStock,
      onDisplayStock: num(p.onDisplayStock),
      daysOfStock: exact > 0 ? Math.round(Math.max(0, currentStock) / exact) : null,
      class: klass as (typeof CLASSES)[number],
    };
  });
  const rows = (cls ? all.filter((r) => r.class === cls) : all).sort(
    (a, b) => b.velocity - a.velocity || b.unitsSold - a.unitsSold || a.name.localeCompare(b.name),
  );

  const totals = {
    products: rows.length,
    fast: all.filter((r) => r.class === "FAST").length,
    normal: all.filter((r) => r.class === "NORMAL").length,
    slow: all.filter((r) => r.class === "SLOW").length,
    unitsSold: round3(rows.reduce((s, r) => s + r.unitsSold, 0)),
    currentStock: round3(rows.reduce((s, r) => s + r.currentStock, 0)),
  };
  return { rows, totals, meta: { days, fast, slow, from, to: todayIST() } };
});
