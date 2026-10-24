// Shared server helpers for the dashboard and reports.
//
// Definitions used everywhere (also shown as help text in the UI):
// - Sales = ACTIVE invoices by invoice date (IST). Sales amount = invoice grand total (incl. GST);
//   net sales = taxable value (excl. GST). ACTIVE credit notes (by their own date) are subtracted.
// - Units sold = Σ SalesOrderItem.quantity of orders whose invoice is ACTIVE.
// - COGS = Σ quantity × SalesOrderItem.unitCost (weighted-average cost at the time of sale).
// - Gross profit = net revenue (taxable − credit-note taxable) − COGS.
// - Stock value = (showroom stock + stock on display) × weighted-average cost.

import { Prisma, type DbOrTx } from "@/lib/db";
import { badRequest, spInt } from "@/lib/http";
import { hasPermission, type SessionUser } from "@/lib/permissions";
import { endOfDayIST, monthStartIST, startOfDayIST, todayIST } from "@/lib/dates";
import { round2 } from "@/lib/calc";

export const REPORT_ROW_CAP = 20000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Period = {
  /** YYYY-MM-DD or "" when open-ended. */
  from: string;
  to: string;
  gte?: Date;
  lte?: Date;
};

/**
 * ?from&to (YYYY-MM-DD, IST). Without either, defaults to this month (or all dates when
 * `defaultToMonth` is false). ?all=1 means "all dates".
 */
export function reportPeriod(sp: URLSearchParams, defaultToMonth = true): Period {
  if (sp.get("all") === "1") return { from: "", to: "" };
  let from = sp.get("from") ?? "";
  let to = sp.get("to") ?? "";
  for (const [k, v] of [
    ["from", from],
    ["to", to],
  ]) {
    if (v && !DATE_RE.test(v)) throw badRequest(`Invalid ${k} date — use YYYY-MM-DD`);
  }
  if (!from && !to && defaultToMonth) {
    from = monthStartIST();
    to = todayIST();
  }
  if (from && to && from > to) throw badRequest("From date is after the to date");
  return { from, to, gte: from ? startOfDayIST(from) : undefined, lte: to ? endOfDayIST(to) : undefined };
}

/** Prisma DateTime filter for a period (undefined when open on both ends). */
export function periodWhere(p: Period) {
  return p.gte || p.lte ? { ...(p.gte ? { gte: p.gte } : {}), ...(p.lte ? { lte: p.lte } : {}) } : undefined;
}

/** SQL condition `col >= from AND col <= to` for a period (TRUE when open). */
export function periodSql(col: Prisma.Sql, p: Period) {
  const parts: Prisma.Sql[] = [];
  if (p.gte) parts.push(Prisma.sql`${col} >= ${p.gte}`);
  if (p.lte) parts.push(Prisma.sql`${col} <= ${p.lte}`);
  return parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`;
}

export function describePeriod(p: Period) {
  if (!p.from && !p.to) return "All Dates";
  return `${p.from || "start"} to ${p.to || "today"}`;
}

// ───────────── Sales filters ─────────────

export type SalesFilters = {
  customerId?: number;
  salespersonId?: number;
  categoryId?: number;
  subCategoryId?: number;
  productId?: number;
  /** True when the user may only see their own sales. */
  ownOnly: boolean;
};

/**
 * customerId, salespersonId, categoryId, subCategoryId, productId from the query string.
 * Users without `sales.viewAll` are always limited to their own sales.
 */
export function salesFilters(sp: URLSearchParams, user: SessionUser): SalesFilters {
  const ownOnly = !hasPermission(user, "sales.viewAll");
  return {
    customerId: spInt(sp, "customerId"),
    salespersonId: ownOnly ? user.id : spInt(sp, "salespersonId"),
    categoryId: spInt(sp, "categoryId"),
    subCategoryId: spInt(sp, "subCategoryId"),
    productId: spInt(sp, "productId"),
    ownOnly,
  };
}

/** True when a filter narrows sales to some products (so amounts must come from line items). */
export const hasItemFilter = (f: SalesFilters) => !!(f.categoryId || f.subCategoryId || f.productId);

/** Prisma where for invoices (ACTIVE, in period, customer, salesperson). */
export function invoiceWhere(p: Period, f: SalesFilters): Prisma.InvoiceWhereInput {
  return {
    status: "ACTIVE",
    ...(periodWhere(p) ? { invoiceDate: periodWhere(p) } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.salespersonId ? { order: { salespersonId: f.salespersonId } } : {}),
  };
}

/** Prisma where for product filters on a related product. */
export function productWhere(f: SalesFilters): Prisma.ProductWhereInput | undefined {
  if (!hasItemFilter(f)) return undefined;
  return {
    ...(f.productId ? { id: f.productId } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.subCategoryId ? { subCategoryId: f.subCategoryId } : {}),
  };
}

/** Prisma where for sales order lines on ACTIVE invoices in the period. */
export function salesLineWhere(
  p: Period,
  f: SalesFilters,
  extraInvoiceWhere?: Prisma.InvoiceWhereInput,
): Prisma.SalesOrderItemWhereInput {
  const pw = productWhere(f);
  const iw = invoiceWhere(p, { ...f, salespersonId: undefined });
  return {
    order: {
      invoice: { is: extraInvoiceWhere ? { AND: [iw, extraInvoiceWhere] } : iw },
      ...(f.salespersonId ? { salespersonId: f.salespersonId } : {}),
    },
    ...(pw ? { product: pw } : {}),
  };
}

/** Prisma where for ACTIVE credit notes dated in the period. */
export function creditNoteWhere(p: Period, f: SalesFilters): Prisma.CreditNoteWhereInput {
  return {
    status: "ACTIVE",
    ...(periodWhere(p) ? { date: periodWhere(p) } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.salespersonId ? { invoice: { order: { salespersonId: f.salespersonId } } } : {}),
  };
}

/** SQL conditions on aliases i (Invoice), o (SalesOrder) for customer/salesperson. */
export function partySql(f: SalesFilters) {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.customerId) parts.push(Prisma.sql`i."customerId" = ${f.customerId}`);
  if (f.salespersonId) parts.push(Prisma.sql`o."salespersonId" = ${f.salespersonId}`);
  return Prisma.join(parts, " AND ");
}

/** SQL conditions on alias p (Product) for product/category filters. */
export function productSql(f: SalesFilters) {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.productId) parts.push(Prisma.sql`p.id = ${f.productId}`);
  if (f.categoryId) parts.push(Prisma.sql`p."categoryId" = ${f.categoryId}`);
  if (f.subCategoryId) parts.push(Prisma.sql`p."subCategoryId" = ${f.subCategoryId}`);
  return Prisma.join(parts, " AND ");
}

/** IST calendar day (date) of a timestamp column, as SQL. */
export const istDay = (col: Prisma.Sql) => Prisma.sql`((${col} + interval '330 minutes')::date)`;

// ───────────── Payment status ─────────────

export const PAYMENT_FILTERS = ["PAID", "PARTIALLY_PAID", "UNPAID", "OVERDUE", "REFUNDED"] as const;

function startOfTodayIST() {
  return startOfDayIST(todayIST());
}

/**
 * Where for the displayed payment status. UNPAID = pending (unpaid, not yet due);
 * PARTIALLY_PAID = part paid, not yet due; OVERDUE = balance due after the due date.
 */
export function paymentStatusWhere(status: string | null | undefined): Prisma.InvoiceWhereInput | undefined {
  if (!status) return undefined;
  const today = startOfTodayIST();
  switch (status) {
    case "PAID":
      return { paymentStatus: "PAID" };
    case "REFUNDED":
      return { paymentStatus: "REFUNDED" };
    case "UNPAID":
      return { paymentStatus: "UNPAID", OR: [{ dueDate: { gte: today } }, { balanceDue: { lte: 0 } }] };
    case "PARTIALLY_PAID":
      return { paymentStatus: "PARTIALLY_PAID", OR: [{ dueDate: { gte: today } }, { balanceDue: { lte: 0 } }] };
    case "OVERDUE":
      return { paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] }, balanceDue: { gt: 0 }, dueDate: { lt: today } };
    default:
      throw badRequest("Invalid payment status");
  }
}

// ───────────── Misc ─────────────

export const num = (v: Prisma.Decimal | number | string | null | undefined) =>
  v === null || v === undefined ? 0 : typeof v === "number" ? v : Number(v);

/** Adds numeric fields of `src` into `acc` (rounded to 2 dp). */
export function addInto<T extends Record<string, number>>(acc: T, src: Partial<T>) {
  for (const k of Object.keys(src) as (keyof T)[]) {
    acc[k] = round2((acc[k] ?? 0) + (src[k] ?? 0)) as T[keyof T];
  }
  return acc;
}

export const pct = (part: number, whole: number) => (whole ? round2((part / whole) * 100) : 0);

/** Days between an instant and now (whole days, IST calendar). */
export function daysSince(d: Date | null | undefined) {
  if (!d) return null;
  const a = startOfDayIST(new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10)).getTime();
  return Math.floor((startOfTodayIST().getTime() - a) / 86_400_000);
}

// ───────────── Dead stock ─────────────

export type DeadStockRow = {
  id: number;
  name: string;
  sku: string;
  category: string;
  supplier: string | null;
  currentStock: number;
  onDisplayStock: number;
  ownedStock: number;
  avgCost: number;
  stockValue: number;
  lastSaleAt: Date | null;
  firstMovementAt: Date | null;
  /** Days since the last sale, or since the first stock movement when never sold. */
  daysSince: number;
};

/**
 * Active products with owned stock (showroom + display) > 0 and no sale on an ACTIVE invoice
 * for at least `days` days. Never-sold items count from their first stock movement.
 */
export async function deadStockRows(
  client: DbOrTx,
  opts: { days: number; categoryId?: number; subCategoryId?: number; supplierId?: number },
): Promise<DeadStockRow[]> {
  const conds: Prisma.Sql[] = [
    Prisma.sql`p."deletedAt" IS NULL`,
    Prisma.sql`p."isActive" = true`,
    Prisma.sql`(p."currentStock" + p."onDisplayStock") > 0`,
  ];
  if (opts.categoryId) conds.push(Prisma.sql`p."categoryId" = ${opts.categoryId}`);
  if (opts.subCategoryId) conds.push(Prisma.sql`p."subCategoryId" = ${opts.subCategoryId}`);
  if (opts.supplierId) conds.push(Prisma.sql`p."preferredSupplierId" = ${opts.supplierId}`);
  const rows = await client.$queryRaw<
    {
      id: number;
      name: string;
      sku: string;
      category: string;
      supplier: string | null;
      currentStock: number;
      onDisplayStock: number;
      avgCost: number;
      lastSaleAt: Date | null;
      firstMovementAt: Date | null;
      createdAt: Date;
    }[]
  >`
    SELECT p.id, p.name, p.sku, c.name AS category, s.name AS supplier,
           p."currentStock"::float8 AS "currentStock", p."onDisplayStock"::float8 AS "onDisplayStock",
           p."avgCost"::float8 AS "avgCost", ls.last AS "lastSaleAt", fm.first AS "firstMovementAt", p."createdAt"
    FROM "Product" p
    JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN "Supplier" s ON s.id = p."preferredSupplierId"
    LEFT JOIN (
      SELECT si."productId", MAX(i."invoiceDate") AS last
      FROM "SalesOrderItem" si JOIN "Invoice" i ON i."orderId" = si."orderId"
      WHERE i.status = 'ACTIVE'
      GROUP BY si."productId"
    ) ls ON ls."productId" = p.id
    LEFT JOIN (
      SELECT "productId", MIN("txnDate") AS first FROM "InventoryTransaction" GROUP BY "productId"
    ) fm ON fm."productId" = p.id
    WHERE ${Prisma.join(conds, " AND ")}`;

  return rows
    .map((r) => {
      const ownedStock = round2(r.currentStock + r.onDisplayStock);
      return {
        id: r.id,
        name: r.name,
        sku: r.sku,
        category: r.category,
        supplier: r.supplier,
        currentStock: r.currentStock,
        onDisplayStock: r.onDisplayStock,
        ownedStock,
        avgCost: r.avgCost,
        stockValue: round2(ownedStock * r.avgCost),
        lastSaleAt: r.lastSaleAt,
        firstMovementAt: r.firstMovementAt,
        daysSince: daysSince(r.lastSaleAt ?? r.firstMovementAt ?? r.createdAt) ?? 0,
      };
    })
    .filter((r) => r.daysSince >= opts.days)
    .sort((a, b) => b.daysSince - a.daysSince || b.stockValue - a.stockValue);
}
