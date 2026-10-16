"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common/form-field";
import { Money } from "@/components/common/misc";
import { api, errorMessage } from "@/lib/api-client";
import { round2, taxes } from "@/lib/calc";
import { todayIST } from "@/lib/dates";
import { formatAmount, formatPercent, formatQty } from "@/lib/format";
import type { InvoiceDetail } from "../types";

/** Financial credit note against invoice lines: taxable amount per line, GST at the line's rate. No stock movement. */
export function CreditNoteDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceDetail;
  onSaved?: (id: number) => void;
}) {
  const lines = invoice.order.items.map((i) => ({ ...i, max: round2(i.taxableValue - (i.creditedTaxable ?? 0)) }));
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIST());
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setAmounts({});
      setReason("");
      setDate(todayIST());
    }
  }

  const computed = lines.map((l) => {
    const amt = Math.max(0, Number(amounts[l.id]) || 0);
    const t = taxes(amt, l.gstRate, l.cessRate, l.taxType, invoice.order.isInterState);
    return { id: l.id, amt, tax: round2(t.cgst + t.sgst + t.igst + t.cess), total: round2(amt + t.cgst + t.sgst + t.igst + t.cess), over: amt > l.max + 0.005 };
  });
  const totalTaxable = round2(computed.reduce((s, c) => s + c.amt, 0));
  const totalTax = round2(computed.reduce((s, c) => s + c.tax, 0));
  const total = round2(computed.reduce((s, c) => s + c.total, 0));
  const invalid = computed.some((c) => c.over) || totalTaxable <= 0 || !reason.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const cn = await api.post<{ id: number; creditNoteNo: string }>("/api/credit-notes", {
        invoiceId: invoice.id,
        date,
        reason,
        items: computed.filter((c) => c.amt > 0).map((c) => ({ orderItemId: c.id, taxableValue: c.amt })),
      });
      toast.success(`Credit note ${cn.creditNoteNo} issued`);
      onSaved?.(cn.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Issue credit note</DialogTitle>
          <DialogDescription>
            Against {invoice.invoiceNo}. Enter the taxable amount to credit per line; GST is added at the line&apos;s rate. Stock does not change.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="border-b">
                  <th className="h-9 px-3 text-left font-medium">Item</th>
                  <th className="px-3 text-right font-medium">Taxable</th>
                  <th className="px-3 text-right font-medium">Can credit</th>
                  <th className="w-36 px-3 text-right font-medium">Credit (taxable)</th>
                  <th className="px-3 text-right font-medium">GST</th>
                  <th className="px-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const c = computed[idx];
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Qty {formatQty(l.quantity)} · GST {formatPercent(l.gstRate)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatAmount(l.taxableValue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline disabled:no-underline"
                          disabled={l.max <= 0}
                          onClick={() => setAmounts((a) => ({ ...a, [l.id]: String(l.max) }))}
                          title="Credit the full remaining amount"
                        >
                          {formatAmount(l.max)}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={l.max}
                          disabled={l.max <= 0}
                          value={amounts[l.id] ?? ""}
                          onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))}
                          aria-invalid={c.over || undefined}
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatAmount(c.tax)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatAmount(c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(totalTaxable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(totalTax)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money value={total} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <Field label="Date" required>
              <Input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Reason" required>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Price adjustment for minor scratch" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || invalid}>
              {busy ? "Saving…" : "Issue credit note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
