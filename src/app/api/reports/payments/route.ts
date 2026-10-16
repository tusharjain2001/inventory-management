import { db, type Prisma } from "@/lib/db";
import { badRequest, handler, spInt } from "@/lib/http";
import { round2 } from "@/lib/calc";
import { daysSince, describePeriod, num, periodWhere, REPORT_ROW_CAP, reportPeriod, salesFilters } from "@/lib/reports";

const MODES = ["CASH", "UPI", "BANK_TRANSFER", "NEFT", "RTGS", "IMPS", "CREDIT_CARD", "DEBIT_CARD", "CHEQUE", "OTHER"] as const;
const AGEING = [
  { key: "NOT_DUE", label: "Not due" },
  { key: "D0_30", label: "0–30 days" },
  { key: "D31_60", label: "31–60 days" },
  { key: "D61_90", label: "61–90 days" },
  { key: "D90", label: "90+ days" },
] as const;

/**
 * Payments received / refunded in a period (default this month) plus outstanding invoices with ageing.
 * ?from&to &customerId &mode &type=RECEIPT|REFUND. Outstanding is as of today (dates do not apply).
 */
export const GET = handler({ permission: "reports.payment" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const period = reportPeriod(sp);
  const f = salesFilters(sp, user);
  const mode = sp.get("mode");
  const type = sp.get("type");
  if (mode && !MODES.includes(mode as (typeof MODES)[number])) throw badRequest("Invalid payment mode");
  if (type && type !== "RECEIPT" && type !== "REFUND") throw badRequest("Invalid payment type");
  const customerId = spInt(sp, "customerId");

  const where: Prisma.PaymentWhereInput = {
    ...(periodWhere(period) ? { paymentDate: periodWhere(period) } : {}),
    ...(customerId ? { customerId } : {}),
    ...(mode ? { mode: mode as (typeof MODES)[number] } : {}),
    ...(type ? { type: type as "RECEIPT" | "REFUND" } : {}),
    ...(f.salespersonId ? { invoice: { order: { salespersonId: f.salespersonId } } } : {}),
  };

  const [payments, open] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
      take: REPORT_ROW_CAP,
      select: {
        id: true,
        paymentNo: true,
        type: true,
        paymentDate: true,
        amount: true,
        mode: true,
        reference: true,
        invoice: { select: { id: true, invoiceNo: true, order: { select: { customerName: true } } } },
        customer: { select: { name: true } },
        receivedBy: { select: { name: true } },
      },
    }),
    db.invoice.findMany({
      where: {
        status: "ACTIVE",
        balanceDue: { gt: 0 },
        ...(customerId ? { customerId } : {}),
        ...(f.salespersonId ? { order: { salespersonId: f.salespersonId } } : {}),
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: REPORT_ROW_CAP,
      select: {
        id: true,
        invoiceNo: true,
        invoiceDate: true,
        dueDate: true,
        grandTotal: true,
        amountPaid: true,
        creditNoteTotal: true,
        balanceDue: true,
        order: { select: { customerName: true, customerPhone: true, salesperson: { select: { name: true } } } },
      },
    }),
  ]);

  const rows = payments.map((p) => {
    const amount = num(p.amount);
    return {
      id: p.id,
      paymentNo: p.paymentNo,
      type: p.type,
      paymentDate: p.paymentDate,
      invoiceId: p.invoice.id,
      invoiceNo: p.invoice.invoiceNo,
      customer: p.invoice.order.customerName || p.customer.name,
      mode: p.mode,
      reference: p.reference ?? "",
      amount,
      /** Receipts positive, refunds negative. */
      net: p.type === "REFUND" ? -amount : amount,
      receivedBy: p.receivedBy?.name ?? "",
    };
  });

  const modeMap = new Map<string, { mode: string; count: number; received: number; refunded: number; net: number }>();
  for (const r of rows) {
    const m = modeMap.get(r.mode) ?? { mode: r.mode, count: 0, received: 0, refunded: 0, net: 0 };
    m.count += 1;
    if (r.type === "REFUND") m.refunded = round2(m.refunded + r.amount);
    else m.received = round2(m.received + r.amount);
    m.net = round2(m.received - m.refunded);
    modeMap.set(r.mode, m);
  }
  const byMode = [...modeMap.values()].sort((a, b) => b.net - a.net);
  const received = round2(byMode.reduce((s, m) => s + m.received, 0));
  const refunded = round2(byMode.reduce((s, m) => s + m.refunded, 0));

  // ── Outstanding & ageing ──
  const outRows = open.map((inv) => {
    const overdueDays = daysSince(inv.dueDate) ?? 0;
    const bucket = overdueDays <= 0 ? "NOT_DUE" : overdueDays <= 30 ? "D0_30" : overdueDays <= 60 ? "D31_60" : overdueDays <= 90 ? "D61_90" : "D90";
    return {
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      customer: inv.order.customerName,
      phone: inv.order.customerPhone ?? "",
      salesperson: inv.order.salesperson?.name ?? "",
      grandTotal: num(inv.grandTotal),
      amountPaid: num(inv.amountPaid),
      creditNoteTotal: num(inv.creditNoteTotal),
      balanceDue: num(inv.balanceDue),
      overdueDays: Math.max(0, overdueDays),
      bucket,
    };
  });
  const ageing = AGEING.map((a) => {
    const list = outRows.filter((r) => r.bucket === a.key);
    return { key: a.key, label: a.label, invoices: list.length, balance: round2(list.reduce((s, r) => s + r.balanceDue, 0)) };
  });

  return {
    rows,
    byMode,
    totals: { payments: rows.length, received, refunded, net: round2(received - refunded) },
    outstanding: {
      rows: outRows,
      ageing,
      totals: {
        invoices: outRows.length,
        grandTotal: round2(outRows.reduce((s, r) => s + r.grandTotal, 0)),
        amountPaid: round2(outRows.reduce((s, r) => s + r.amountPaid, 0)),
        creditNoteTotal: round2(outRows.reduce((s, r) => s + r.creditNoteTotal, 0)),
        balanceDue: round2(outRows.reduce((s, r) => s + r.balanceDue, 0)),
        overdue: round2(outRows.filter((r) => r.overdueDays > 0).reduce((s, r) => s + r.balanceDue, 0)),
      },
    },
    meta: { period: describePeriod(period), from: period.from, to: period.to, ownOnly: f.ownOnly },
  };
});
