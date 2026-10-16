"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { EntityPicker } from "@/components/common/entity-picker";
import { useSession } from "@/components/session-provider";
import { useMeta } from "@/hooks/use-meta";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { istDateString, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import { PAYMENT_MODE_OPTIONS, type InvoiceRow, type PaymentRow } from "../types";

export type PaymentInvoiceRef = { id: number; invoiceNo: string; balanceDue: number; amountPaid: number; customerName: string };

type FormState = {
  type: "RECEIPT" | "REFUND";
  paymentDate: string;
  amount: string;
  mode: string;
  reference: string;
  notes: string;
  receivedById: string;
};

/**
 * Record a receipt / refund (or edit one). Pass `invoice` to fix the invoice;
 * without it the user picks an invoice (unpaid ones for receipts).
 */
export function PaymentDialog({
  open,
  onOpenChange,
  invoice: fixedInvoice,
  type: initialType = "RECEIPT",
  payment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: PaymentInvoiceRef | null;
  type?: "RECEIPT" | "REFUND";
  payment?: PaymentRow | null;
  onSaved?: () => void;
}) {
  const { user } = useSession();
  const { data: meta } = useMeta();
  const [picked, setPicked] = useState<PaymentInvoiceRef | null>(null);
  const invoice = fixedInvoice ?? picked;

  const init = (): FormState => {
    const type = payment?.type ?? initialType;
    const suggested = fixedInvoice ? (type === "RECEIPT" ? fixedInvoice.balanceDue : Math.max(0, -fixedInvoice.balanceDue)) : 0;
    return {
      type,
      paymentDate: payment ? istDateString(payment.paymentDate) : todayIST(),
      amount: payment ? String(payment.amount) : suggested > 0 ? String(suggested) : "",
      mode: payment?.mode ?? "CASH",
      reference: payment?.reference ?? "",
      notes: payment?.notes ?? "",
      receivedById: String(payment?.receivedById ?? user.id),
    };
  };
  const [form, setForm] = useState<FormState>(init);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(init());
      setErrors({});
      setPicked(null);
    }
  }
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const isRefund = form.type === "REFUND";
  const limit = invoice ? (isRefund ? invoice.amountPaid : invoice.balanceDue) + (payment ? payment.amount : 0) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice && !payment) {
      toast.error("Choose an invoice");
      return;
    }
    setBusy(true);
    setErrors({});
    const data = {
      paymentDate: form.paymentDate,
      amount: form.amount,
      mode: form.mode,
      reference: form.reference || null,
      notes: form.notes || null,
      receivedById: form.receivedById || null,
    };
    try {
      if (payment) {
        await api.patch(`/api/payments/${payment.id}`, data);
        toast.success("Payment updated");
      } else {
        await api.post("/api/payments", { ...data, invoiceId: invoice!.id, type: form.type });
        toast.success(isRefund ? "Refund recorded" : "Payment recorded");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = payment ? `Edit ${isRefund ? "refund" : "payment"} ${payment.paymentNo}` : isRefund ? "Record refund" : "Record payment";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {invoice && (
            <DialogDescription>
              {invoice.invoiceNo} · {invoice.customerName} · Balance {formatINR(invoice.balanceDue)} · Paid {formatINR(invoice.amountPaid)}
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {!fixedInvoice && !payment && (
            <>
              <Field label="Type" className="sm:col-span-2">
                <SimpleSelect
                  value={form.type}
                  onChange={(v) => {
                    set("type", v as FormState["type"]);
                    setPicked(null);
                  }}
                  options={[
                    { value: "RECEIPT", label: "Receipt (money in)" },
                    { value: "REFUND", label: "Refund (money out)" },
                  ]}
                />
              </Field>
              <Field label="Invoice" required className="sm:col-span-2">
                <EntityPicker<InvoiceRow>
                  endpoint="/api/invoices"
                  params={isRefund ? { status: "ACTIVE" } : { unpaid: true }}
                  value={picked?.id}
                  selectedLabel={picked ? `${picked.invoiceNo} · ${picked.customerName}` : undefined}
                  placeholder={isRefund ? "Choose invoice" : "Choose unpaid invoice"}
                  searchPlaceholder="Invoice no. or customer"
                  toOption={(r) => ({
                    value: r.id,
                    label: `${r.invoiceNo} · ${r.order.customerName}`,
                    sub: `Total ${formatINR(r.grandTotal)} · Balance ${formatINR(r.balanceDue)}`,
                    raw: r,
                  })}
                  onChange={(o) => {
                    if (!o) return setPicked(null);
                    const r = o.raw;
                    setPicked({ id: r.id, invoiceNo: r.invoiceNo, balanceDue: r.balanceDue, amountPaid: r.amountPaid, customerName: r.order.customerName });
                    if (!isRefund && r.balanceDue > 0) set("amount", String(r.balanceDue));
                  }}
                />
              </Field>
            </>
          )}
          <Field label="Date" required error={errors.paymentDate}>
            <Input type="date" value={form.paymentDate} max={todayIST()} onChange={(e) => set("paymentDate", e.target.value)} required />
          </Field>
          <Field
            label="Amount (₹)"
            required
            error={errors.amount}
            hint={limit !== null ? `Max ${formatINR(Math.max(0, limit))}` : undefined}
          >
            <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} required autoFocus />
          </Field>
          <Field label="Mode" required error={errors.mode}>
            <SimpleSelect value={form.mode} onChange={(v) => set("mode", v)} options={PAYMENT_MODE_OPTIONS} />
          </Field>
          <Field label="Reference" error={errors.reference} hint="UTR, cheque no., card last 4…">
            <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>
          <Field label={isRefund ? "Paid by" : "Received by"} className="sm:col-span-2">
            <SimpleSelect
              value={form.receivedById}
              onChange={(v) => set("receivedById", v)}
              options={(meta?.users ?? [{ id: user.id, name: user.name }]).map((u) => ({ value: String(u.id), label: u.name }))}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <DialogFooter className="mt-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (!invoice && !payment)} variant={isRefund ? "destructive" : "default"}>
              {busy ? "Saving…" : payment ? "Save" : isRefund ? "Record refund" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
