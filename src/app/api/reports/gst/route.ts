import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { hsnSummary, round2, taxes } from "@/lib/calc";
import {
  creditNoteWhere,
  describePeriod,
  invoiceWhere,
  num,
  periodWhere,
  REPORT_ROW_CAP,
  reportPeriod,
  salesFilters,
  type SalesFilters,
} from "@/lib/reports";

type TaxSum = { taxable: number; cgst: number; sgst: number; igst: number; cess: number; totalTax: number; total: number };

const emptySum = (): TaxSum => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, totalTax: 0, total: 0 });
function addSum(a: TaxSum, r: Omit<TaxSum, "totalTax">) {
  a.taxable = round2(a.taxable + r.taxable);
  a.cgst = round2(a.cgst + r.cgst);
  a.sgst = round2(a.sgst + r.sgst);
  a.igst = round2(a.igst + r.igst);
  a.cess = round2(a.cess + r.cess);
  a.totalTax = round2(a.cgst + a.sgst + a.igst + a.cess);
  a.total = round2(a.total + r.total);
}

/**
 * GST summary for a period (default this month): HSN-wise and rate-wise output tax from ACTIVE
 * invoices less ACTIVE credit notes, B2B/B2C invoice list, credit notes, and input GST on purchases.
 * ?from&to &customerId
 */
export const GET = handler({ permission: "reports.gst" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const period = reportPeriod(sp);
  const sf = salesFilters(sp, user);
  // Product filters do not apply to GST returns.
  const f: SalesFilters = { customerId: sf.customerId, salespersonId: sf.salespersonId, ownOnly: sf.ownOnly };

  const [invoices, cnotes, purchases] = await Promise.all([
    db.invoice.findMany({
      where: invoiceWhere(period, f),
      orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
      take: REPORT_ROW_CAP,
      select: {
        id: true,
        invoiceNo: true,
        invoiceDate: true,
        grandTotal: true,
        order: {
          select: {
            customerName: true,
            customerGstin: true,
            placeOfSupply: true,
            placeOfSupplyCode: true,
            isInterState: true,
            taxableTotal: true,
            cgstTotal: true,
            sgstTotal: true,
            igstTotal: true,
            cessTotal: true,
            otherCharges: true,
            otherChargesGstRate: true,
            items: {
              select: {
                hsnCode: true,
                gstRate: true,
                taxableValue: true,
                cgstAmount: true,
                sgstAmount: true,
                igstAmount: true,
                cessAmount: true,
              },
            },
          },
        },
      },
    }),
    db.creditNote.findMany({
      where: creditNoteWhere(period, f),
      orderBy: [{ date: "asc" }, { id: "asc" }],
      take: REPORT_ROW_CAP,
      select: {
        id: true,
        creditNoteNo: true,
        date: true,
        reason: true,
        taxableTotal: true,
        cgstTotal: true,
        sgstTotal: true,
        igstTotal: true,
        cessTotal: true,
        total: true,
        invoice: { select: { invoiceNo: true, order: { select: { customerName: true, customerGstin: true, placeOfSupply: true } } } },
        items: {
          select: {
            hsnCode: true,
            gstRate: true,
            taxableValue: true,
            cgstAmount: true,
            sgstAmount: true,
            igstAmount: true,
            cessAmount: true,
          },
        },
      },
    }),
    db.stockInItem.groupBy({
      by: ["gstRate"],
      where: { stockIn: periodWhere(period) ? { date: periodWhere(period) } : {} },
      _sum: { taxableValue: true, gstAmount: true, totalCost: true },
      orderBy: { gstRate: "asc" },
    }),
  ]);

  // ── HSN-wise (sales less credit notes) ──
  type Line = Parameters<typeof hsnSummary>[0][number];
  const lines: Line[] = [];
  const toLine = (
    l: { hsnCode: string | null; gstRate: unknown; taxableValue: unknown; cgstAmount: unknown; sgstAmount: unknown; igstAmount: unknown; cessAmount: unknown },
    sign: 1 | -1,
  ): Line => ({
    hsnCode: l.hsnCode,
    gstRate: num(l.gstRate as number),
    taxableValue: sign * num(l.taxableValue as number),
    cgstAmount: sign * num(l.cgstAmount as number),
    sgstAmount: sign * num(l.sgstAmount as number),
    igstAmount: sign * num(l.igstAmount as number),
    cessAmount: sign * num(l.cessAmount as number),
  });
  for (const inv of invoices) {
    for (const l of inv.order.items) lines.push(toLine(l, 1));
    const oc = num(inv.order.otherCharges);
    if (oc > 0) {
      const rate = num(inv.order.otherChargesGstRate);
      const t = taxes(oc, rate, 0, "GST", inv.order.isInterState);
      lines.push({ hsnCode: "Other charges", gstRate: rate, taxableValue: oc, cgstAmount: t.cgst, sgstAmount: t.sgst, igstAmount: t.igst, cessAmount: 0 });
    }
  }
  for (const cn of cnotes) for (const l of cn.items) lines.push(toLine(l, -1));
  const hsn = hsnSummary(lines).sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.gstRate - b.gstRate);

  // ── Rate-wise ──
  const rateMap = new Map<number, TaxSum & { gstRate: number }>();
  for (const r of hsn) {
    const row = rateMap.get(r.gstRate) ?? { gstRate: r.gstRate, ...emptySum() };
    addSum(row, { taxable: r.taxableValue, cgst: r.cgst, sgst: r.sgst, igst: r.igst, cess: r.cess, total: round2(r.taxableValue + r.totalTax) });
    rateMap.set(r.gstRate, row);
  }
  const rates = [...rateMap.values()].sort((a, b) => a.gstRate - b.gstRate);

  // ── Invoice list, B2B vs B2C ──
  const rows = invoices.map((inv) => {
    const o = inv.order;
    const gstin = (o.customerGstin ?? "").trim();
    return {
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      customer: o.customerName,
      gstin,
      type: gstin ? "B2B" : "B2C",
      placeOfSupply: `${o.placeOfSupplyCode}-${o.placeOfSupply}`,
      taxable: num(o.taxableTotal),
      cgst: num(o.cgstTotal),
      sgst: num(o.sgstTotal),
      igst: num(o.igstTotal),
      cess: num(o.cessTotal),
      total: num(inv.grandTotal),
    };
  });
  const split = { B2B: { invoices: 0, ...emptySum() }, B2C: { invoices: 0, ...emptySum() } };
  for (const r of rows) {
    const s = split[r.type as "B2B" | "B2C"];
    s.invoices += 1;
    addSum(s, r);
  }

  const creditNotes = cnotes.map((cn) => ({
    id: cn.id,
    creditNoteNo: cn.creditNoteNo,
    date: cn.date,
    invoiceNo: cn.invoice.invoiceNo,
    customer: cn.invoice.order.customerName,
    gstin: cn.invoice.order.customerGstin ?? "",
    reason: cn.reason,
    taxable: num(cn.taxableTotal),
    cgst: num(cn.cgstTotal),
    sgst: num(cn.sgstTotal),
    igst: num(cn.igstTotal),
    cess: num(cn.cessTotal),
    total: num(cn.total),
  }));

  const salesSum = emptySum();
  rows.forEach((r) => addSum(salesSum, r));
  const cnSum = emptySum();
  creditNotes.forEach((r) => addSum(cnSum, r));

  const inputRates = purchases.map((p) => ({
    gstRate: num(p.gstRate),
    taxable: round2(num(p._sum.taxableValue)),
    gst: round2(num(p._sum.gstAmount)),
    total: round2(num(p._sum.totalCost)),
  }));
  const inputGst = {
    taxable: round2(inputRates.reduce((s, r) => s + r.taxable, 0)),
    gst: round2(inputRates.reduce((s, r) => s + r.gst, 0)),
    byRate: inputRates,
  };

  const outputTax = round2(salesSum.totalTax - cnSum.totalTax);
  return {
    rows,
    hsn,
    rates,
    split,
    creditNotes,
    inputGst,
    totals: {
      invoices: rows.length,
      sales: salesSum,
      creditNotes: cnSum,
      netTaxable: round2(salesSum.taxable - cnSum.taxable),
      outputTax,
      inputTax: inputGst.gst,
      netTax: round2(outputTax - inputGst.gst),
    },
    meta: { period: describePeriod(period), from: period.from, to: period.to, ownOnly: f.ownOnly },
  };
});
