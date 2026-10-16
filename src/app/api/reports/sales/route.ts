import { db } from "@/lib/db";
import { badRequest, handler } from "@/lib/http";
import { effectivePaymentStatus, round2, round3 } from "@/lib/calc";
import { istDateString } from "@/lib/dates";
import {
  creditNoteWhere,
  describePeriod,
  num,
  paymentStatusWhere,
  productWhere,
  REPORT_ROW_CAP,
  reportPeriod,
  salesFilters,
  salesLineWhere,
} from "@/lib/reports";

const GROUPS = ["line", "invoice", "product", "customer", "salesperson", "day"] as const;
type GroupBy = (typeof GROUPS)[number];

type Amounts = { quantity: number; gross: number; discount: number; taxable: number; gst: number; total: number };

/**
 * Line-level sales on ACTIVE invoices. ?from&to (default this month) &customerId &salespersonId
 * &categoryId &subCategoryId &productId &paymentStatus=PAID|PARTIALLY_PAID|UNPAID|OVERDUE|REFUNDED
 * &groupBy=line|invoice|product|customer|salesperson|day
 */
export const GET = handler({ permission: "reports.sales" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const period = reportPeriod(sp);
  const f = salesFilters(sp, user);
  const groupBy = (sp.get("groupBy") ?? "line") as GroupBy;
  if (!GROUPS.includes(groupBy)) throw badRequest("Invalid groupBy");
  const payWhere = paymentStatusWhere(sp.get("paymentStatus"));

  const lines = await db.salesOrderItem.findMany({
    where: salesLineWhere(period, f, payWhere),
    take: REPORT_ROW_CAP,
    orderBy: [{ order: { invoice: { invoiceDate: "asc" } } }, { orderId: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      productId: true,
      sku: true,
      name: true,
      quantity: true,
      grossAmount: true,
      discountAmount: true,
      invoiceDiscountShare: true,
      taxableValue: true,
      cgstAmount: true,
      sgstAmount: true,
      igstAmount: true,
      cessAmount: true,
      lineTotal: true,
      product: { select: { category: { select: { name: true } } } },
      order: {
        select: {
          customerId: true,
          customerName: true,
          salespersonId: true,
          salesperson: { select: { name: true } },
          invoice: {
            select: {
              id: true,
              invoiceNo: true,
              invoiceDate: true,
              dueDate: true,
              status: true,
              paymentStatus: true,
              balanceDue: true,
              grandTotal: true,
            },
          },
        },
      },
    },
  });

  const lineRows = lines.map((l) => {
    const inv = l.order.invoice!;
    return {
      key: String(l.id),
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      day: istDateString(inv.invoiceDate),
      customerId: l.order.customerId,
      customer: l.order.customerName,
      salespersonId: l.order.salespersonId,
      salesperson: l.order.salesperson?.name ?? "",
      productId: l.productId,
      product: l.name,
      sku: l.sku,
      category: l.product.category.name,
      quantity: num(l.quantity),
      gross: num(l.grossAmount),
      discount: round2(num(l.discountAmount) + num(l.invoiceDiscountShare)),
      taxable: num(l.taxableValue),
      gst: round2(num(l.cgstAmount) + num(l.sgstAmount) + num(l.igstAmount) + num(l.cessAmount)),
      total: num(l.lineTotal),
      paymentStatus: effectivePaymentStatus({
        paymentStatus: inv.paymentStatus,
        dueDate: inv.dueDate,
        balanceDue: num(inv.balanceDue),
        status: inv.status,
      }),
      invoiceTotal: num(inv.grandTotal),
    };
  });

  // ── Totals ──
  const zero = (): Amounts => ({ quantity: 0, gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 });
  const add = (a: Amounts, r: Amounts) => {
    a.quantity = round3(a.quantity + r.quantity);
    a.gross = round2(a.gross + r.gross);
    a.discount = round2(a.discount + r.discount);
    a.taxable = round2(a.taxable + r.taxable);
    a.gst = round2(a.gst + r.gst);
    a.total = round2(a.total + r.total);
  };
  const sums = zero();
  lineRows.forEach((r) => add(sums, r));
  const invoiceIds = new Set(lineRows.map((r) => r.invoiceId));

  // Credit notes in the period with the same filters (item-linked lines when filtering by product).
  const pw = productWhere(f);
  const cnWhere = creditNoteWhere(period, f);
  const credit = pw
    ? await db.creditNoteItem.aggregate({
        where: { creditNote: cnWhere, orderItem: { product: pw } },
        _sum: { total: true, taxableValue: true },
      })
    : await db.creditNote.aggregate({ where: cnWhere, _sum: { total: true, taxableTotal: true } });
  const creditTotal = round2(num(credit._sum.total));

  const totals = {
    ...sums,
    orders: invoiceIds.size,
    lines: lineRows.length,
    avgOrderValue: invoiceIds.size ? round2(sums.total / invoiceIds.size) : 0,
    creditNotes: creditTotal,
    totalAfterCredit: round2(sums.total - creditTotal),
  };

  // ── Grouping ──
  let rows: unknown[] = lineRows;
  if (groupBy !== "line") {
    const map = new Map<string, Amounts & Record<string, unknown> & { invoices: Set<number> }>();
    for (const r of lineRows) {
      const key =
        groupBy === "invoice"
          ? `i${r.invoiceId}`
          : groupBy === "product"
            ? `p${r.productId}`
            : groupBy === "customer"
              ? `c${r.customerId}`
              : groupBy === "salesperson"
                ? `s${r.salespersonId ?? 0}`
                : r.day;
      let g = map.get(key);
      if (!g) {
        const head =
          groupBy === "invoice"
            ? {
                label: r.invoiceNo,
                invoiceId: r.invoiceId,
                invoiceDate: r.invoiceDate,
                customer: r.customer,
                salesperson: r.salesperson,
                paymentStatus: r.paymentStatus,
              }
            : groupBy === "product"
              ? { label: r.product, sku: r.sku, category: r.category, productId: r.productId }
              : groupBy === "customer"
                ? { label: r.customer, customerId: r.customerId }
                : groupBy === "salesperson"
                  ? { label: r.salesperson || "(none)", salespersonId: r.salespersonId }
                  : { label: r.day, day: r.day };
        g = { key, ...head, ...zero(), invoices: new Set<number>() };
        map.set(key, g);
      }
      add(g, r);
      g.invoices.add(r.invoiceId);
    }
    rows = [...map.values()].map(({ invoices, ...g }) => ({
      ...g,
      orders: invoices.size,
      avgOrderValue: invoices.size ? round2(g.total / invoices.size) : 0,
    }));
    if (groupBy !== "invoice" && groupBy !== "day") {
      (rows as Amounts[]).sort((a, b) => b.total - a.total);
    }
  }

  return {
    rows,
    totals,
    meta: {
      period: describePeriod(period),
      from: period.from,
      to: period.to,
      groupBy,
      ownOnly: f.ownOnly,
      capped: lines.length >= REPORT_ROW_CAP,
    },
  };
});
