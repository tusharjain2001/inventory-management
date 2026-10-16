import { db, Prisma } from "@/lib/db";
import { handler, spBool, spInt } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";
import { round2, round3 } from "@/lib/calc";
import { describePeriod, periodSql, REPORT_ROW_CAP, reportPeriod } from "@/lib/reports";

type Agg = {
  productId: number;
  opening: number;
  displayOpening: number;
  stockIn: number;
  sold: number;
  display: number;
  damaged: number;
  lost: number;
  adjustments: number;
  closing: number;
  displayClosing: number;
};

/**
 * Stock movement summary per product for a period (default this month).
 * ?from&to &categoryId &subCategoryId &q (name/SKU) &inactive=true
 * Opening = Σ stock effect before `from`; closing = opening + all effects in the period (showroom stock).
 */
export const GET = handler({ permission: "reports.stock" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const period = reportPeriod(sp);
  const showCost = hasPermission(user, "products.viewCost");
  const q = (sp.get("q") ?? "").trim();
  const includeInactive = spBool(sp, "inactive") === true;

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      ...(includeInactive ? {} : { isActive: true }),
      ...(spInt(sp, "categoryId") ? { categoryId: spInt(sp, "categoryId") } : {}),
      ...(spInt(sp, "subCategoryId") ? { subCategoryId: spInt(sp, "subCategoryId") } : {}),
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { name: "asc" },
    take: REPORT_ROW_CAP,
    select: {
      id: true,
      name: true,
      sku: true,
      isActive: true,
      avgCost: true,
      currentStock: true,
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
    },
  });

  const before = period.gte ? Prisma.sql`t."txnDate" < ${period.gte}` : Prisma.sql`FALSE`;
  const inside = periodSql(Prisma.sql`t."txnDate"`, period);
  const upTo = period.lte ? Prisma.sql`t."txnDate" <= ${period.lte}` : Prisma.sql`TRUE`;
  const sumIf = (cond: Prisma.Sql, expr: Prisma.Sql) => Prisma.sql`COALESCE(SUM(CASE WHEN ${cond} THEN ${expr} ELSE 0 END), 0)::float8`;
  const qtyOf = (types: string[]) =>
    sumIf(Prisma.sql`${inside} AND t.type::text IN (${Prisma.join(types)})`, Prisma.sql`t.quantity`);

  const ids = products.map((p) => p.id);
  const aggs = ids.length
    ? await db.$queryRaw<Agg[]>`
        SELECT t."productId",
               ${sumIf(before, Prisma.sql`t."stockEffect"`)} AS opening,
               ${sumIf(before, Prisma.sql`t."displayEffect"`)} AS "displayOpening",
               ${qtyOf(["STOCK_IN", "OPENING"])} AS "stockIn",
               (${qtyOf(["SALE"])} - ${qtyOf(["SALE_REVERSAL"])}) AS sold,
               (${qtyOf(["DISPLAY_OUT"])} - ${qtyOf(["DISPLAY_RETURN"])}) AS display,
               ${qtyOf(["DAMAGED"])} AS damaged,
               ${qtyOf(["LOST"])} AS lost,
               (${qtyOf(["ADJUSTMENT_IN"])} - ${qtyOf(["ADJUSTMENT_OUT"])}) AS adjustments,
               COALESCE(SUM(t."stockEffect"), 0)::float8 AS closing,
               COALESCE(SUM(t."displayEffect"), 0)::float8 AS "displayClosing"
        FROM "InventoryTransaction" t
        WHERE t."productId" IN (${Prisma.join(ids)}) AND ${upTo}
        GROUP BY t."productId"`
    : [];
  const byId = new Map(aggs.map((a) => [a.productId, a]));

  const rows = products.map((p) => {
    const a = byId.get(p.id);
    const closing = round3(a?.closing ?? 0);
    const displayClosing = round3(a?.displayClosing ?? 0);
    const avgCost = p.avgCost.toNumber();
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.subCategory ? `${p.category.name} › ${p.subCategory.name}` : p.category.name,
      isActive: p.isActive,
      opening: round3(a?.opening ?? 0),
      stockIn: round3(a?.stockIn ?? 0),
      sold: round3(a?.sold ?? 0),
      display: round3(a?.display ?? 0),
      damaged: round3(a?.damaged ?? 0),
      lost: round3(a?.lost ?? 0),
      adjustments: round3(a?.adjustments ?? 0),
      closing,
      displayClosing,
      currentStock: p.currentStock.toNumber(),
      ...(showCost ? { avgCost, stockValue: round2((closing + displayClosing) * avgCost) } : {}),
    };
  });

  const sum = (k: keyof (typeof rows)[number]) => round3(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
  const totals = {
    products: rows.length,
    opening: sum("opening"),
    stockIn: sum("stockIn"),
    sold: sum("sold"),
    display: sum("display"),
    damaged: sum("damaged"),
    lost: sum("lost"),
    adjustments: sum("adjustments"),
    closing: sum("closing"),
    displayClosing: sum("displayClosing"),
    ...(showCost ? { stockValue: round2(rows.reduce((s, r) => s + (r.stockValue ?? 0), 0)) } : {}),
  };

  return { rows, totals, meta: { period: describePeriod(period), from: period.from, to: period.to, showCost } };
});
