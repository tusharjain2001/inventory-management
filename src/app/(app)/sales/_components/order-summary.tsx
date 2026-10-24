"use client";

import { Money } from "@/components/common/misc";
import { formatAmount, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderItem, OrderTotalsFields } from "../types";

/** Read-only order lines (order view, invoice view). */
export function ItemsTable({ items, showCost }: { items: OrderItem[]; showCost?: boolean }) {
  const hasDiscount = items.some((i) => i.discountAmount > 0);
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr className="border-b">
            <th className="h-9 px-3 text-left font-medium">#</th>
            <th className="px-3 text-left font-medium">Item</th>
            <th className="px-3 text-left font-medium">HSN</th>
            <th className="px-3 text-right font-medium">Qty</th>
            <th className="px-3 text-right font-medium">Rate</th>
            {hasDiscount && <th className="px-3 text-right font-medium">Discount</th>}
            <th className="px-3 text-right font-medium">GST</th>
            <th className="px-3 text-right font-medium">Taxable</th>
            <th className="px-3 text-right font-medium">Total</th>
            {showCost && <th className="px-3 text-right font-medium">Cost / Unit</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((i, idx) => (
            <tr key={i.id} className="border-b last:border-0">
              <td className="px-3 py-2 align-top text-muted-foreground">{idx + 1}</td>
              <td className="min-w-48 px-3 py-2 align-top">
                <div className="font-medium">{i.name}</div>
                <div className="text-xs text-muted-foreground">
                  {i.sku}
                  {i.description ? ` · ${i.description}` : ""}
                  {i.displayIssueItemId ? " · from display" : ""}
                </div>
                {i.priceOverride && (
                  <div className="text-[11px] text-amber-700">Price override{i.overrideBy ? ` by ${i.overrideBy.name}` : ""}</div>
                )}
              </td>
              <td className="px-3 py-2 align-top">{i.hsnCode ?? "—"}</td>
              <td className="px-3 py-2 text-right align-top tabular-nums">{formatQty(i.quantity)}</td>
              <td className="px-3 py-2 text-right align-top tabular-nums">
                {formatAmount(i.unitPrice)}
                {i.taxInclusive && <div className="text-[11px] text-muted-foreground">incl. tax</div>}
              </td>
              {hasDiscount && (
                <td className="px-3 py-2 text-right align-top tabular-nums">
                  {i.discountAmount > 0 ? (
                    <>
                      {formatAmount(i.discountAmount)}
                      {i.discountPercent > 0 && <div className="text-[11px] text-muted-foreground">{formatPercent(i.discountPercent)}</div>}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              <td className="px-3 py-2 text-right align-top tabular-nums">{i.taxType === "GST" ? formatPercent(i.gstRate) : i.taxType}</td>
              <td className="px-3 py-2 text-right align-top tabular-nums">
                {formatAmount(i.taxableValue)}
                {i.invoiceDiscountShare > 0 && (
                  <div className="text-[11px] text-muted-foreground">after {formatAmount(i.invoiceDiscountShare)} inv. disc.</div>
                )}
              </td>
              <td className="px-3 py-2 text-right align-top font-medium tabular-nums">{formatAmount(i.lineTotal)}</td>
              {showCost && <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">{formatAmount(i.unitCost)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type TotalsView = Pick<
  OrderTotalsFields,
  | "subtotal"
  | "itemDiscountTotal"
  | "invoiceDiscountAmount"
  | "otherCharges"
  | "otherChargesLabel"
  | "taxableTotal"
  | "cgstTotal"
  | "sgstTotal"
  | "igstTotal"
  | "cessTotal"
  | "roundOff"
  | "grandTotal"
  | "isInterState"
> & { invoiceDiscountLabel?: string };

function Row({ label, value, muted, strong }: { label: React.ReactNode; value: number; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1", muted && "text-muted-foreground", strong && "font-semibold")}>
      <span>{label}</span>
      <Money value={value} />
    </div>
  );
}

/** Subtotal → discounts → taxable → GST → round off → grand total. */
export function TotalsList({ t, className }: { t: TotalsView; className?: string }) {
  return (
    <div className={cn("text-sm", className)}>
      <Row label="Subtotal" value={t.subtotal} />
      {t.itemDiscountTotal > 0 && <Row label="Item Discount" value={-t.itemDiscountTotal} muted />}
      {t.invoiceDiscountAmount > 0 && <Row label={t.invoiceDiscountLabel ?? "Invoice Discount"} value={-t.invoiceDiscountAmount} muted />}
      {t.otherCharges > 0 && <Row label={t.otherChargesLabel || "Other Charges"} value={t.otherCharges} />}
      <div className="my-1 border-t" />
      <Row label="Taxable Value" value={t.taxableTotal} strong />
      {t.isInterState ? (
        <Row label="IGST" value={t.igstTotal} />
      ) : (
        <>
          <Row label="CGST" value={t.cgstTotal} />
          <Row label="SGST" value={t.sgstTotal} />
        </>
      )}
      {t.cessTotal > 0 && <Row label="Cess" value={t.cessTotal} />}
      {Math.abs(t.roundOff) > 0.001 && <Row label="Round Off" value={t.roundOff} muted />}
      <div className="mt-1 flex items-center justify-between border-t pt-2 text-base font-semibold">
        <span>Grand Total</span>
        <Money value={t.grandTotal} />
      </div>
    </div>
  );
}
