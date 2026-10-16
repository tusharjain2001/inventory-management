import { db } from "@/lib/db";
import { badRequest, handler } from "@/lib/http";
import { round2, round3, taxes } from "@/lib/calc";
import {
  creditNoteWhere,
  describePeriod,
  hasItemFilter,
  invoiceWhere,
  num,
  pct,
  productWhere,
  REPORT_ROW_CAP,
  reportPeriod,
  salesFilters,
  salesLineWhere,
} from "@/lib/reports";

type Row = {
  key: string;
  label: string;
  sub?: string;
  date?: Date;
  quantity: number;
  sales: number;
  discount: number;
  netSales: number;
  creditNotes: number;
  netRevenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  gst: number;
};

/**
 * Gross profit per product (or per invoice with ?groupBy=invoice).
 * ?from&to (default this month) &categoryId &subCategoryId &productId &customerId &salespersonId
 * Net revenue = taxable value − credit-note taxable; COGS = qty × weighted-average cost at sale.
 */
export const GET = handler({ permission: "reports.profit" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const period = reportPeriod(sp);
  const f = salesFilters(sp, user);
  const groupBy = sp.get("groupBy") ?? "product";
  if (groupBy !== "product" && groupBy !== "invoice") throw badRequest("Invalid groupBy");
  const byInvoice = groupBy === "invoice";
  const pw = productWhere(f);

  const [lines, cnItems, charges] = await Promise.all([
    db.salesOrderItem.findMany({
      where: salesLineWhere(period, f),
      take: REPORT_ROW_CAP,
      select: {
        productId: true,
        name: true,
        sku: true,
        quantity: true,
        grossAmount: true,
        discountAmount: true,
        invoiceDiscountShare: true,
        taxableValue: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        cessAmount: true,
        unitCost: true,
        product: { select: { category: { select: { name: true } } } },
        order: { select: { customerName: true, invoice: { select: { id: true, invoiceNo: true, invoiceDate: true } } } },
      },
    }),
    db.creditNoteItem.findMany({
      where: { creditNote: creditNoteWhere(period, f), ...(pw ? { orderItem: { product: pw } } : {}) },
      select: {
        taxableValue: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        cessAmount: true,
        orderItem: { select: { productId: true, name: true, sku: true, product: { select: { category: { select: { name: true } } } } } },
        creditNote: {
          select: {
            invoice: { select: { id: true, invoiceNo: true, invoiceDate: true, order: { select: { customerName: true } } } },
          },
        },
      },
    }),
    // Other charges (delivery etc.) are revenue too, but cannot be tied to a product filter.
    hasItemFilter(f)
      ? Promise.resolve([])
      : db.salesOrder.findMany({
          where: {
            otherCharges: { gt: 0 },
            invoice: { is: invoiceWhere(period, { ...f, salespersonId: undefined }) },
            ...(f.salespersonId ? { salespersonId: f.salespersonId } : {}),
          },
          select: {
            otherCharges: true,
            otherChargesGstRate: true,
            isInterState: true,
            customerName: true,
            invoice: { select: { id: true, invoiceNo: true, invoiceDate: true } },
          },
        }),
  ]);

  const map = new Map<string, Row>();
  const row = (key: string, head: Pick<Row, "label" | "sub" | "date">) => {
    let r = map.get(key);
    if (!r) {
      r = { key, ...head, quantity: 0, sales: 0, discount: 0, netSales: 0, creditNotes: 0, netRevenue: 0, cogs: 0, profit: 0, marginPct: 0, gst: 0 };
      map.set(key, r);
    }
    return r;
  };
  const tax = (x: { cgstAmount: unknown; sgstAmount: unknown; igstAmount: unknown; cessAmount: unknown }) =>
    num(x.cgstAmount as number) + num(x.sgstAmount as number) + num(x.igstAmount as number) + num(x.cessAmount as number);

  for (const l of lines) {
    const inv = l.order.invoice!;
    const r = byInvoice
      ? row(`i${inv.id}`, { label: inv.invoiceNo, sub: l.order.customerName, date: inv.invoiceDate })
      : row(`p${l.productId}`, { label: l.name, sub: `${l.sku} · ${l.product.category.name}` });
    const qty = num(l.quantity);
    r.quantity += qty;
    r.sales += num(l.grossAmount);
    r.discount += num(l.discountAmount) + num(l.invoiceDiscountShare);
    r.netSales += num(l.taxableValue);
    r.cogs += qty * num(l.unitCost);
    r.gst += tax(l);
  }

  for (const c of charges) {
    const inv = c.invoice!;
    const amount = num(c.otherCharges);
    const t = taxes(amount, num(c.otherChargesGstRate), 0, "GST", c.isInterState);
    const r = byInvoice
      ? row(`i${inv.id}`, { label: inv.invoiceNo, sub: c.customerName, date: inv.invoiceDate })
      : row("charges", { label: "Other charges", sub: "Delivery, installation etc." });
    r.sales += amount;
    r.netSales += amount;
    r.gst += t.cgst + t.sgst + t.igst;
  }

  for (const c of cnItems) {
    const inv = c.creditNote.invoice;
    const oi = c.orderItem;
    const r = byInvoice
      ? row(`i${inv.id}`, { label: inv.invoiceNo, sub: inv.order.customerName, date: inv.invoiceDate })
      : oi
        ? row(`p${oi.productId}`, { label: oi.name, sub: `${oi.sku} · ${oi.product.category.name}` })
        : row("cn", { label: "Credit notes (not linked to a product)" });
    r.creditNotes += num(c.taxableValue);
    r.gst -= tax(c);
  }

  const rows = [...map.values()].map((r) => {
    const netRevenue = round2(r.netSales - r.creditNotes);
    const cogs = round2(r.cogs);
    return {
      ...r,
      quantity: round3(r.quantity),
      sales: round2(r.sales),
      discount: round2(r.discount),
      netSales: round2(r.netSales),
      creditNotes: round2(r.creditNotes),
      netRevenue,
      cogs,
      profit: round2(netRevenue - cogs),
      marginPct: pct(netRevenue - cogs, netRevenue),
      gst: round2(r.gst),
    };
  });
  if (byInvoice) rows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0) || a.label.localeCompare(b.label));
  else rows.sort((a, b) => b.profit - a.profit);

  const sum = (k: "quantity" | "sales" | "discount" | "netSales" | "creditNotes" | "netRevenue" | "cogs" | "profit" | "gst") =>
    round2(rows.reduce((s, r) => s + r[k], 0));
  const netRevenue = sum("netRevenue");
  const profit = sum("profit");
  const totals = {
    quantity: round3(rows.reduce((s, r) => s + r.quantity, 0)),
    sales: sum("sales"),
    discount: sum("discount"),
    netSales: sum("netSales"),
    creditNotes: sum("creditNotes"),
    netRevenue,
    cogs: sum("cogs"),
    profit,
    marginPct: pct(profit, netRevenue),
    gst: sum("gst"),
  };

  return {
    rows,
    totals,
    meta: { period: describePeriod(period), from: period.from, to: period.to, groupBy, ownOnly: f.ownOnly },
  };
});
