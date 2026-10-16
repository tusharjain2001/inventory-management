// Client-safe sales/GST calculations. The server recomputes every document with these
// same functions, so on-screen previews always match what gets saved.

export type TaxTypeName = "GST" | "EXEMPT" | "NIL_RATED" | "ZERO_RATED";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export type LineInput = {
  quantity: number;
  unitPrice: number;
  taxInclusive?: boolean;
  /** Item discount as % of the gross amount. Takes precedence over discountAmount when > 0. */
  discountPercent?: number;
  discountAmount?: number;
  gstRate: number;
  cessRate?: number;
  taxType?: TaxTypeName;
  hsnCode?: string | null;
};

export type LineResult = {
  grossAmount: number;
  discountPercent: number;
  discountAmount: number;
  invoiceDiscountShare: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  lineTotal: number;
};

export type OrderInput = {
  lines: LineInput[];
  isInterState: boolean;
  invoiceDiscountType?: "PERCENT" | "AMOUNT" | null;
  invoiceDiscountValue?: number;
  otherCharges?: number;
  otherChargesGstRate?: number;
  roundOff?: boolean;
};

export type OrderTotals = {
  lines: LineResult[];
  subtotal: number;
  itemDiscountTotal: number;
  invoiceDiscountAmount: number;
  otherCharges: number;
  otherChargesTax: { cgst: number; sgst: number; igst: number };
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  cessTotal: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
};

export function taxes(taxable: number, gstRate: number, cessRate: number, taxType: TaxTypeName, isInterState: boolean) {
  if (taxType !== "GST") return { cgst: 0, sgst: 0, igst: 0, cess: 0 };
  if (isInterState) {
    return { cgst: 0, sgst: 0, igst: round2((taxable * gstRate) / 100), cess: round2((taxable * cessRate) / 100) };
  }
  const half = round2((taxable * gstRate) / 200);
  return { cgst: half, sgst: half, igst: 0, cess: round2((taxable * cessRate) / 100) };
}

/**
 * Line maths:
 *   gross = qty × unit price; item discount = gross × % (or a fixed amount)
 *   taxable = gross − discount (tax-inclusive prices are first divided by 1 + rate)
 *   invoice-level discount is spread across lines in proportion to taxable value,
 *   so it reduces the taxable value (as GST requires for discounts shown on the invoice)
 *   tax = CGST+SGST (intra-state) or IGST (inter-state), plus cess
 */
export function calculateOrder(input: OrderInput): OrderTotals {
  const pre = input.lines.map((l) => {
    const qty = Number(l.quantity) || 0;
    const price = Number(l.unitPrice) || 0;
    const gross = round2(qty * price);
    const pct = Number(l.discountPercent) || 0;
    const discount = pct > 0 ? round2((gross * pct) / 100) : Math.min(round2(Number(l.discountAmount) || 0), gross);
    const taxType = l.taxType ?? "GST";
    const rate = taxType === "GST" ? (Number(l.gstRate) || 0) + (Number(l.cessRate) || 0) : 0;
    const net = gross - discount;
    const taxableBefore = l.taxInclusive ? round2(net / (1 + rate / 100)) : round2(net);
    return { gross, pct, discount, taxableBefore, taxType };
  });

  const sumBefore = round2(pre.reduce((s, p) => s + p.taxableBefore, 0));
  let invoiceDiscount = 0;
  const dv = Number(input.invoiceDiscountValue) || 0;
  if (input.invoiceDiscountType === "PERCENT" && dv > 0) invoiceDiscount = round2((sumBefore * dv) / 100);
  if (input.invoiceDiscountType === "AMOUNT" && dv > 0) invoiceDiscount = Math.min(round2(dv), sumBefore);

  // Spread invoice discount; the last line with value absorbs rounding.
  const shares = pre.map(() => 0);
  if (invoiceDiscount > 0 && sumBefore > 0) {
    let allocated = 0;
    const lastIdx = pre.map((p) => p.taxableBefore > 0).lastIndexOf(true);
    pre.forEach((p, i) => {
      if (i === lastIdx) shares[i] = round2(invoiceDiscount - allocated);
      else {
        shares[i] = round2((invoiceDiscount * p.taxableBefore) / sumBefore);
        allocated = round2(allocated + shares[i]);
      }
    });
  }

  const lines: LineResult[] = pre.map((p, i) => {
    const l = input.lines[i];
    const taxable = round2(p.taxableBefore - shares[i]);
    const t = taxes(taxable, Number(l.gstRate) || 0, Number(l.cessRate) || 0, p.taxType, input.isInterState);
    return {
      grossAmount: p.gross,
      discountPercent: p.pct,
      discountAmount: p.discount,
      invoiceDiscountShare: shares[i],
      taxableValue: taxable,
      cgstAmount: t.cgst,
      sgstAmount: t.sgst,
      igstAmount: t.igst,
      cessAmount: t.cess,
      lineTotal: round2(taxable + t.cgst + t.sgst + t.igst + t.cess),
    };
  });

  const otherCharges = round2(Number(input.otherCharges) || 0);
  const oc = taxes(otherCharges, Number(input.otherChargesGstRate) || 0, 0, "GST", input.isInterState);

  const sum = (f: (l: LineResult) => number) => round2(lines.reduce((s, l) => s + f(l), 0));
  const cgstTotal = round2(sum((l) => l.cgstAmount) + oc.cgst);
  const sgstTotal = round2(sum((l) => l.sgstAmount) + oc.sgst);
  const igstTotal = round2(sum((l) => l.igstAmount) + oc.igst);
  const cessTotal = sum((l) => l.cessAmount);
  const taxableTotal = round2(sum((l) => l.taxableValue) + otherCharges);
  const taxTotal = round2(cgstTotal + sgstTotal + igstTotal + cessTotal);
  const beforeRound = round2(taxableTotal + taxTotal);
  const grandTotal = input.roundOff ? Math.round(beforeRound) : beforeRound;

  return {
    lines,
    subtotal: sum((l) => l.grossAmount),
    itemDiscountTotal: sum((l) => l.discountAmount),
    invoiceDiscountAmount: invoiceDiscount,
    otherCharges,
    otherChargesTax: { cgst: oc.cgst, sgst: oc.sgst, igst: oc.igst },
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    cessTotal,
    taxTotal,
    roundOff: round2(grandTotal - beforeRound),
    grandTotal,
  };
}

export type HsnRow = {
  hsnCode: string;
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
};

/** HSN-wise tax summary for the invoice footer and GST reports. */
export function hsnSummary(
  lines: { hsnCode?: string | null; gstRate: number; taxableValue: number; cgstAmount: number; sgstAmount: number; igstAmount: number; cessAmount: number }[],
  otherCharges?: { amount: number; gstRate: number; cgst: number; sgst: number; igst: number },
): HsnRow[] {
  const map = new Map<string, HsnRow>();
  const add = (hsn: string, rate: number, taxable: number, cgst: number, sgst: number, igst: number, cess: number) => {
    const key = `${hsn}|${rate}`;
    const row = map.get(key) ?? { hsnCode: hsn, gstRate: rate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, totalTax: 0 };
    row.taxableValue = round2(row.taxableValue + taxable);
    row.cgst = round2(row.cgst + cgst);
    row.sgst = round2(row.sgst + sgst);
    row.igst = round2(row.igst + igst);
    row.cess = round2(row.cess + cess);
    row.totalTax = round2(row.cgst + row.sgst + row.igst + row.cess);
    map.set(key, row);
  };
  for (const l of lines) add(l.hsnCode || "-", Number(l.gstRate), l.taxableValue, l.cgstAmount, l.sgstAmount, l.igstAmount, l.cessAmount);
  if (otherCharges && otherCharges.amount > 0) {
    add("Other charges", otherCharges.gstRate, otherCharges.amount, otherCharges.cgst, otherCharges.sgst, otherCharges.igst, 0);
  }
  return [...map.values()];
}

// ───────────── Payment status ─────────────

export type PaymentStatusName = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "REFUNDED";
export type EffectivePaymentStatus = PaymentStatusName | "OVERDUE";

/** Stored status + due date → status to display (adds OVERDUE). */
export function effectivePaymentStatus(inv: {
  paymentStatus: PaymentStatusName;
  dueDate: string | Date;
  balanceDue: number;
  status?: "ACTIVE" | "CANCELLED";
}): EffectivePaymentStatus {
  if (inv.status === "CANCELLED") return "CANCELLED";
  if (
    (inv.paymentStatus === "UNPAID" || inv.paymentStatus === "PARTIALLY_PAID") &&
    inv.balanceDue > 0.005 &&
    new Date(inv.dueDate).getTime() < startOfTodayMs()
  ) {
    return "OVERDUE";
  }
  return inv.paymentStatus;
}

function startOfTodayMs() {
  const ist = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return new Date(`${ist}T00:00:00+05:30`).getTime();
}

/** Computes the stored payment status from totals. */
export function derivePaymentStatus(args: {
  grandTotal: number;
  creditNoteTotal: number;
  receipts: number;
  refunds: number;
  cancelled: boolean;
}): { paymentStatus: PaymentStatusName; amountPaid: number; balanceDue: number } {
  const amountPaid = round2(args.receipts - args.refunds);
  const balanceDue = round2(args.grandTotal - args.creditNoteTotal - amountPaid);
  if (args.cancelled) return { paymentStatus: args.refunds > 0 && amountPaid <= 0.005 ? "REFUNDED" : "CANCELLED", amountPaid, balanceDue };
  if (args.refunds > 0 && amountPaid <= 0.005) return { paymentStatus: "REFUNDED", amountPaid, balanceDue };
  if (balanceDue <= 0.005) return { paymentStatus: "PAID", amountPaid, balanceDue };
  if (amountPaid > 0.005) return { paymentStatus: "PARTIALLY_PAID", amountPaid, balanceDue };
  return { paymentStatus: "UNPAID", amountPaid, balanceDue };
}

// ───────────── Stock status ─────────────

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "NEGATIVE";

export function stockStatus(currentStock: number, reorderLevel: number): StockStatus {
  if (currentStock < 0) return "NEGATIVE";
  if (currentStock === 0) return "OUT_OF_STOCK";
  if (currentStock <= reorderLevel) return "LOW_STOCK";
  return "IN_STOCK";
}
