import { label } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  // good
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IN_STOCK: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INVOICED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLOSED: "bg-slate-100 text-slate-700 border-slate-200",
  FAST: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // in progress
  CONFIRMED: "bg-sky-50 text-sky-700 border-sky-200",
  PARTIALLY_PAID: "bg-sky-50 text-sky-700 border-sky-200",
  OUT: "bg-violet-50 text-violet-700 border-violet-200",
  PARTIAL: "bg-sky-50 text-sky-700 border-sky-200",
  NORMAL: "bg-slate-100 text-slate-700 border-slate-200",
  // warnings
  UNPAID: "bg-amber-50 text-amber-800 border-amber-200",
  LOW_STOCK: "bg-amber-50 text-amber-800 border-amber-200",
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  SLOW: "bg-amber-50 text-amber-800 border-amber-200",
  // bad
  OVERDUE: "bg-red-50 text-red-700 border-red-200",
  OUT_OF_STOCK: "bg-red-50 text-red-700 border-red-200",
  NEGATIVE: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  REFUNDED: "bg-slate-100 text-slate-700 border-slate-200",
  DEAD: "bg-red-50 text-red-700 border-red-200",
  INACTIVE: "bg-slate-100 text-slate-500 border-slate-200",
  // users / sign-ins
  LOCKED: "bg-red-50 text-red-700 border-red-200",
  SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  // inventory: damaged / lost, stock-in sources
  DAMAGED: "bg-amber-50 text-amber-800 border-amber-200",
  LOST: "bg-red-50 text-red-700 border-red-200",
  PURCHASE: "bg-sky-50 text-sky-700 border-sky-200",
  SUPPLIER_RECEIPT: "bg-teal-50 text-teal-700 border-teal-200",
  // approvals
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

/** Coloured pill for any status enum value (payment, order, stock, display…). */
export function StatusBadge({ status, text, className }: { status: string; text?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        TONES[status] ?? "bg-slate-100 text-slate-700 border-slate-200",
        className,
      )}
    >
      {text ?? label(status)}
    </span>
  );
}
