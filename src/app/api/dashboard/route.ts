import { db, Prisma } from "@/lib/db";
import { handler } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";
import { getSettingsGroup } from "@/lib/settings";
import { round2 } from "@/lib/calc";
import { addDays, financialYear, istDateString, monthStartIST, startOfDayIST, todayIST } from "@/lib/dates";
import {
  deadStockRows,
  hasItemFilter,
  istDay,
  partySql,
  pct,
  periodSql,
  productSql,
  reportPeriod,
  salesFilters,
  type Period,
  type SalesFilters,
} from "@/lib/reports";

type Day = { day: string; amount: number; net: number; invoices: number; units: number; cogs: number; cnTotal: number; cnTaxable: number };
type Figures = { amount: number; net: number; invoices: number; units: number; cogs: number; cnTotal: number; cnTaxable: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const noon = (d: string) => new Date(`${d}T12:00:00+05:30`);
const shortDate = (d: string) => `${d.slice(8, 10)}-${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/**
 * Dashboard figures. ?from&to (default this month) &categoryId &subCategoryId &productId
 * &customerId &salespersonId (filters apply to sales figures) &top=5|10|20
 */
export const GET = handler({ permission: "dashboard.view" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const period = reportPeriod(sp);
  const f = salesFilters(sp, user);
  const top = [5, 10, 20].includes(Number(sp.get("top"))) ? Number(sp.get("top")) : 5;
  const financials = hasPermission(user, "dashboard.financials");
  const itemFilter = hasItemFilter(f);

  const today = todayIST();
  const fyStartYear = Number(financialYear().slice(0, 4)) - 2;
  const seriesStart = [`${fyStartYear}-04-01`, period.from].filter(Boolean).sort()[0];
  const series: Period = {
    from: period.from ? seriesStart : "",
    to: "",
    gte: period.from ? startOfDayIST(seriesStart) : undefined,
  };

  const analysis = await getSettingsGroup("analysis");

  const [days, topProducts, categories, stock, dead, payPeriod, payAll] = await Promise.all([
    dailySales(series, f, itemFilter),
    topProductsQuery(period, f, top),
    categoryQuery(period, f),
    stockQuery(),
    deadStockRows(db, { days: analysis.deadStockDays }),
    paymentStatusQuery(period, f),
    paymentStatusQuery({ from: "", to: "" }, f),
  ]);

  // ── KPI figures from the daily series ──
  const sumDays = (from: string, to: string): Figures => {
    const out: Figures = { amount: 0, net: 0, invoices: 0, units: 0, cogs: 0, cnTotal: 0, cnTaxable: 0 };
    for (const d of days) {
      if ((from && d.day < from) || (to && d.day > to)) continue;
      out.amount += d.amount;
      out.net += d.net;
      out.invoices += d.invoices;
      out.units += d.units;
      out.cogs += d.cogs;
      out.cnTotal += d.cnTotal;
      out.cnTaxable += d.cnTaxable;
    }
    for (const k of Object.keys(out) as (keyof Figures)[]) out[k] = round2(out[k]);
    return out;
  };
  const brief = (x: Figures) => ({ amount: x.amount, invoices: x.invoices, units: x.units });

  const sel = sumDays(period.from, period.to);
  const netRevenue = round2(sel.net - sel.cnTaxable);
  const selected = {
    amount: sel.amount,
    net: sel.net,
    creditNotes: sel.cnTotal,
    amountAfterCredit: round2(sel.amount - sel.cnTotal),
    netRevenue,
    invoices: sel.invoices,
    units: sel.units,
    avgInvoice: sel.invoices ? round2(sel.amount / sel.invoices) : 0,
    ...(financials
      ? { cogs: sel.cogs, grossProfit: round2(netRevenue - sel.cogs), marginPct: pct(netRevenue - sel.cogs, netRevenue) }
      : {}),
  };

  // ── Trend buckets ──
  const bucket = (keys: { key: string; label: string; from: string; to: string }[]) =>
    keys.map((k) => {
      let amount = 0;
      let invoices = 0;
      let units = 0;
      for (const d of days) {
        if (d.day < k.from || d.day > k.to) continue;
        amount += d.amount;
        invoices += d.invoices;
        units += d.units;
      }
      return { key: k.key, label: k.label, from: k.from, to: k.to, amount: round2(amount), invoices, units: round2(units) };
    });

  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = istDateString(addDays(noon(today), i - 6));
    return { key: d, label: shortDate(d), from: d, to: d };
  }).reverse();

  const dow = (noon(today).getUTCDay() + 6) % 7; // 0 = Monday
  const thisMonday = istDateString(addDays(noon(today), -dow));
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const from = istDateString(addDays(noon(thisMonday), -7 * i));
    const to = istDateString(addDays(noon(from), 6));
    return { key: from, label: `${shortDate(from)} – ${shortDate(to)}`, from, to };
  });

  const [ty, tm] = today.split("-").map(Number);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const idx = ty * 12 + (tm - 1) - i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const to = istDateString(addDays(noon(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`), -1));
    return { key: from.slice(0, 7), label: `${MONTHS[m - 1]} ${y}`, from, to };
  });

  const yearly = Array.from({ length: 3 }, (_, i) => {
    const y = fyStartYear + 2 - i;
    return { key: `${y}`, label: `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`, from: `${y}-04-01`, to: `${y + 1}-03-31` };
  });

  // ── Stock ──
  const deadCount = dead.length;

  // ── Payment status ──
  const order = ["PAID", "PARTIALLY_PAID", "UNPAID", "OVERDUE", "REFUNDED"];
  const paymentStatus = order
    .map((status) => {
      const r = payPeriod.find((p) => p.status === status);
      return { status, count: r?.count ?? 0, value: round2(r?.value ?? 0), balance: round2(r?.balance ?? 0) };
    })
    .filter((r) => r.status !== "REFUNDED" || r.count > 0);
  const open = payAll.filter((p) => ["UNPAID", "PARTIALLY_PAID", "OVERDUE"].includes(p.status));
  const overdue = payAll.find((p) => p.status === "OVERDUE");

  return {
    period: { from: period.from, to: period.to },
    financials,
    itemFilter,
    ownOnly: f.ownOnly,
    deadStockDays: analysis.deadStockDays,
    stock: {
      units: round2(stock.units),
      showroomUnits: round2(stock.showroom),
      displayUnits: round2(stock.display),
      skus: stock.skus,
      value: financials ? round2(stock.value) : null,
      normal: stock.normal,
      low: stock.low,
      out: stock.out,
      dead: deadCount,
    },
    today: brief(sumDays(today, today)),
    month: brief(sumDays(monthStartIST(), today)),
    selected,
    topProducts,
    categories,
    trend: { daily: bucket(daily), weekly: bucket(weekly), monthly: bucket(monthly), yearly: bucket(yearly) },
    paymentStatus,
    outstanding: {
      invoices: open.reduce((s, p) => s + p.count, 0),
      balance: round2(open.reduce((s, p) => s + p.balance, 0)),
      overdueInvoices: overdue?.count ?? 0,
      overdueBalance: round2(overdue?.balance ?? 0),
    },
  };
});

/** Sales per IST day: invoice totals (or line totals when a product filter is set), units, COGS and credit notes. */
async function dailySales(p: Period, f: SalesFilters, itemFilter: boolean): Promise<Day[]> {
  const inPeriod = periodSql(Prisma.sql`i."invoiceDate"`, p);
  const [inv, items, cn] = await Promise.all([
    itemFilter
      ? Promise.resolve([] as { day: string; amount: number; net: number; invoices: number }[])
      : db.$queryRaw<{ day: string; amount: number; net: number; invoices: number }[]>`
          SELECT ${istDay(Prisma.sql`i."invoiceDate"`)}::text AS day,
                 SUM(i."grandTotal")::float8 AS amount,
                 SUM(o."taxableTotal")::float8 AS net,
                 COUNT(*)::int AS invoices
          FROM "Invoice" i JOIN "SalesOrder" o ON o.id = i."orderId"
          WHERE i.status = 'ACTIVE' AND ${inPeriod} AND ${partySql(f)}
          GROUP BY 1`,
    db.$queryRaw<{ day: string; amount: number; net: number; invoices: number; units: number; cogs: number }[]>`
      SELECT ${istDay(Prisma.sql`i."invoiceDate"`)}::text AS day,
             SUM(si."lineTotal")::float8 AS amount,
             SUM(si."taxableValue")::float8 AS net,
             COUNT(DISTINCT i.id)::int AS invoices,
             SUM(si.quantity)::float8 AS units,
             SUM(si.quantity * si."unitCost")::float8 AS cogs
      FROM "SalesOrderItem" si
      JOIN "SalesOrder" o ON o.id = si."orderId"
      JOIN "Invoice" i ON i."orderId" = o.id
      JOIN "Product" p ON p.id = si."productId"
      WHERE i.status = 'ACTIVE' AND ${inPeriod} AND ${partySql(f)} AND ${productSql(f)}
      GROUP BY 1`,
    itemFilter
      ? db.$queryRaw<{ day: string; total: number; taxable: number }[]>`
          SELECT ${istDay(Prisma.sql`cn.date`)}::text AS day,
                 SUM(ci.total)::float8 AS total, SUM(ci."taxableValue")::float8 AS taxable
          FROM "CreditNoteItem" ci
          JOIN "CreditNote" cn ON cn.id = ci."creditNoteId"
          JOIN "Invoice" i ON i.id = cn."invoiceId"
          JOIN "SalesOrder" o ON o.id = i."orderId"
          JOIN "SalesOrderItem" si ON si.id = ci."orderItemId"
          JOIN "Product" p ON p.id = si."productId"
          WHERE cn.status = 'ACTIVE' AND ${periodSql(Prisma.sql`cn.date`, p)} AND ${partySql(f)} AND ${productSql(f)}
          GROUP BY 1`
      : db.$queryRaw<{ day: string; total: number; taxable: number }[]>`
          SELECT ${istDay(Prisma.sql`cn.date`)}::text AS day,
                 SUM(cn.total)::float8 AS total, SUM(cn."taxableTotal")::float8 AS taxable
          FROM "CreditNote" cn
          JOIN "Invoice" i ON i.id = cn."invoiceId"
          JOIN "SalesOrder" o ON o.id = i."orderId"
          WHERE cn.status = 'ACTIVE' AND ${periodSql(Prisma.sql`cn.date`, p)} AND ${partySql(f)}
          GROUP BY 1`,
  ]);

  const map = new Map<string, Day>();
  const get = (day: string) => {
    let d = map.get(day);
    if (!d) map.set(day, (d = { day, amount: 0, net: 0, invoices: 0, units: 0, cogs: 0, cnTotal: 0, cnTaxable: 0 }));
    return d;
  };
  for (const r of items) {
    const d = get(r.day);
    d.units = r.units;
    d.cogs = r.cogs;
    if (itemFilter) {
      d.amount = r.amount;
      d.net = r.net;
      d.invoices = r.invoices;
    }
  }
  for (const r of inv) {
    const d = get(r.day);
    d.amount = r.amount;
    d.net = r.net;
    d.invoices = r.invoices;
  }
  for (const r of cn) {
    const d = get(r.day);
    d.cnTotal = r.total;
    d.cnTaxable = r.taxable;
  }
  return [...map.values()];
}

function topProductsQuery(p: Period, f: SalesFilters, top: number) {
  return db.$queryRaw<{ id: number; name: string; sku: string; units: number; amount: number }[]>`
    SELECT p.id, p.name, p.sku,
           SUM(si.quantity)::float8 AS units,
           SUM(si."lineTotal")::float8 AS amount
    FROM "SalesOrderItem" si
    JOIN "SalesOrder" o ON o.id = si."orderId"
    JOIN "Invoice" i ON i."orderId" = o.id
    JOIN "Product" p ON p.id = si."productId"
    WHERE i.status = 'ACTIVE' AND ${periodSql(Prisma.sql`i."invoiceDate"`, p)} AND ${partySql(f)} AND ${productSql(f)}
    GROUP BY p.id, p.name, p.sku
    ORDER BY units DESC, amount DESC
    LIMIT ${top}`;
}

function categoryQuery(p: Period, f: SalesFilters) {
  return db.$queryRaw<{ id: number; name: string; units: number; amount: number; net: number }[]>`
    SELECT c.id, c.name,
           SUM(si.quantity)::float8 AS units,
           SUM(si."lineTotal")::float8 AS amount,
           SUM(si."taxableValue")::float8 AS net
    FROM "SalesOrderItem" si
    JOIN "SalesOrder" o ON o.id = si."orderId"
    JOIN "Invoice" i ON i."orderId" = o.id
    JOIN "Product" p ON p.id = si."productId"
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE i.status = 'ACTIVE' AND ${periodSql(Prisma.sql`i."invoiceDate"`, p)} AND ${partySql(f)} AND ${productSql(f)}
    GROUP BY c.id, c.name
    ORDER BY amount DESC`;
}

async function stockQuery() {
  const [r] = await db.$queryRaw<
    { skus: number; units: number; showroom: number; display: number; value: number; normal: number; low: number; out: number }[]
  >`
    SELECT COUNT(*)::int AS skus,
           COALESCE(SUM("currentStock" + "onDisplayStock"), 0)::float8 AS units,
           COALESCE(SUM("currentStock"), 0)::float8 AS showroom,
           COALESCE(SUM("onDisplayStock"), 0)::float8 AS display,
           COALESCE(SUM(("currentStock" + "onDisplayStock") * "avgCost"), 0)::float8 AS value,
           COUNT(*) FILTER (WHERE "currentStock" > "reorderLevel")::int AS normal,
           COUNT(*) FILTER (WHERE "currentStock" > 0 AND "currentStock" <= "reorderLevel")::int AS low,
           COUNT(*) FILTER (WHERE "currentStock" <= 0)::int AS out
    FROM "Product"
    WHERE "deletedAt" IS NULL AND "isActive" = true`;
  return r;
}

/** Invoice count, value (less credit notes) and balance per displayed payment status. */
function paymentStatusQuery(p: Period, f: SalesFilters) {
  const today = startOfDayIST(todayIST());
  return db.$queryRaw<{ status: string; count: number; value: number; balance: number }[]>`
    SELECT CASE
             WHEN i."paymentStatus" IN ('UNPAID', 'PARTIALLY_PAID') AND i."balanceDue" > 0.005 AND i."dueDate" < ${today}
             THEN 'OVERDUE' ELSE i."paymentStatus"::text
           END AS status,
           COUNT(*)::int AS count,
           SUM(i."grandTotal" - i."creditNoteTotal")::float8 AS value,
           SUM(i."balanceDue")::float8 AS balance
    FROM "Invoice" i JOIN "SalesOrder" o ON o.id = i."orderId"
    WHERE i.status = 'ACTIVE' AND ${periodSql(Prisma.sql`i."invoiceDate"`, p)} AND ${partySql(f)}
    GROUP BY 1`;
}
