import type { Prisma } from "@/lib/db";
import type { Settings } from "@/lib/settings-schema";

// An invoice needs an e-way bill when it is active, worth more than the threshold (incl. GST)
// and inter-state (or any sale, when the setting asks for intra-state too).
// The number itself comes from ewaybillgst.gov.in and is entered on the invoice.

export const EWAY_FILTERS = ["REQUIRED", "PENDING", "GENERATED"] as const;
export type EWayFilter = (typeof EWAY_FILTERS)[number];
export type EWayStatus = "NOT_REQUIRED" | "PENDING" | "GENERATED";
type Cfg = Pick<Settings["invoice"], "eWayBillThreshold" | "eWayBillWithinState">;

export function eWayBillStatus(
  inv: { status: string; grandTotal: Prisma.Decimal | number; eWayBillNo: string | null; order: { isInterState: boolean } },
  cfg: Cfg,
): EWayStatus {
  if (inv.eWayBillNo) return "GENERATED";
  const required = inv.status === "ACTIVE" && Number(inv.grandTotal) > cfg.eWayBillThreshold && (inv.order.isInterState || cfg.eWayBillWithinState);
  return required ? "PENDING" : "NOT_REQUIRED";
}

/** Prisma filter for invoices by e-way bill status. */
export function eWayBillWhere(filter: string | null | undefined, cfg: Cfg): Prisma.InvoiceWhereInput {
  if (!filter) return {};
  const required: Prisma.InvoiceWhereInput = {
    status: "ACTIVE",
    grandTotal: { gt: cfg.eWayBillThreshold },
    ...(cfg.eWayBillWithinState ? {} : { order: { isInterState: true } }),
  };
  if (filter === "GENERATED") return { eWayBillNo: { not: null } };
  if (filter === "PENDING") return { AND: [required, { eWayBillNo: null }] };
  if (filter === "REQUIRED") return { OR: [required, { eWayBillNo: { not: null } }] };
  return {};
}
