// Client-safe display formatting (Indian number system).

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatINR = (n: number | null | undefined) => inr.format(Number(n) || 0);
/** 58,000.00 — amount without the currency symbol (invoices, tables). */
export const formatAmount = (n: number | null | undefined) => num2.format(Number(n) || 0);

export function formatQty(n: number | null | undefined) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(v);
}

export const formatPercent = (n: number | null | undefined) =>
  `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(n) || 0)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function istParts(value: string | Date) {
  const d = new Date(new Date(value).getTime() + 330 * 60_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

/** 12-Oct-2026 (matches the Tally invoice style). */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const p = istParts(value);
  return `${String(p.day).padStart(2, "0")}-${MONTHS[p.m]}-${p.y}`;
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const p = istParts(value);
  const h12 = p.h % 12 || 12;
  return `${formatDate(value)} ${String(h12).padStart(2, "0")}:${String(p.min).padStart(2, "0")} ${p.h < 12 ? "AM" : "PM"}`;
}

// ───────────── Amount in words (Indian system) ─────────────

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/** "INR Sixty Eight Thousand Four Hundred Forty Only" */
export function amountInWords(amount: number) {
  const abs = Math.abs(Math.round((Number(amount) || 0) * 100));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const words = `INR ${integerToWords(rupees)}${paise ? ` and ${twoDigits(paise)} paise` : ""} Only`;
  return amount < 0 ? `Minus ${words}` : words;
}

export const ENUM_LABELS: Record<string, string> = {
  // payment status
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  // order status
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  INVOICED: "Invoiced",
  ACTIVE: "Active",
  // stock
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
  NEGATIVE: "Negative Stock",
  // display
  OUT: "On Display",
  PARTIAL: "Partly Closed",
  CLOSED: "Closed",
  // payment modes
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  NEFT: "NEFT",
  RTGS: "RTGS",
  IMPS: "IMPS",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
  RECEIPT: "Receipt",
  REFUND: "Refund",
  // customer types
  INDIVIDUAL: "Individual",
  BUSINESS: "Business",
  DEALER: "Dealer",
  DISTRIBUTOR: "Distributor",
  RETAILER: "Retailer",
  // tax types
  GST: "GST",
  EXEMPT: "Exempt",
  NIL_RATED: "Nil Rated",
  ZERO_RATED: "Zero Rated",
  // stock in sources
  PURCHASE: "Purchase",
  SUPPLIER_RECEIPT: "Supplier Receipt",
  OPENING: "Opening Stock",
  MANUAL: "Manual",
  // loss / adjustment
  DAMAGED: "Damaged",
  LOST: "Lost",
  INCREASE: "Increase",
  DECREASE: "Decrease",
  // users / sign-ins
  INACTIVE: "Inactive",
  LOCKED: "Locked",
  SUCCESS: "Success",
  FAILED: "Failed",
};

export const label = (value: string | null | undefined) => (value ? (ENUM_LABELS[value] ?? value) : "");
