"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common/form-field";
import { istDateString, todayIST } from "@/lib/dates";
import type { DespatchFields } from "../types";

export type DespatchForm = { [K in keyof DespatchFields]: string } & { invoiceDate: string };

export const DESPATCH_FIELDS: { key: keyof DespatchFields; label: string; type?: "date" }[] = [
  { key: "eWayBillNo", label: "e-Way Bill No." },
  { key: "deliveryNote", label: "Delivery Note" },
  { key: "supplierRef", label: "Supplier's Ref." },
  { key: "otherReferences", label: "Other Reference(s)" },
  { key: "buyersOrderNo", label: "Buyer's Order No." },
  { key: "buyersOrderDate", label: "Buyer's Order Date", type: "date" },
  { key: "despatchDocNo", label: "Despatch Document No." },
  { key: "despatchedThrough", label: "Despatched through" },
  { key: "destination", label: "Destination" },
  { key: "termsOfDelivery", label: "Terms of Delivery" },
];

export function emptyDespatch(from?: Partial<DespatchFields> | null): DespatchForm {
  const out = { invoiceDate: todayIST() } as DespatchForm;
  for (const f of DESPATCH_FIELDS) {
    const v = from?.[f.key];
    out[f.key] = v ? (f.type === "date" ? istDateString(v) : v) : "";
  }
  return out;
}

/** Despatch / reference fields shown in the invoice header boxes. Used for "Generate invoice" and later edits. */
export function DespatchFieldsGrid({ form, onChange, withDate }: { form: DespatchForm; onChange: (f: DespatchForm) => void; withDate?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {withDate && (
        <Field label="Invoice date" required className="sm:col-span-2">
          <Input type="date" value={form.invoiceDate} max={todayIST()} onChange={(e) => onChange({ ...form, invoiceDate: e.target.value })} />
        </Field>
      )}
      {DESPATCH_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} className={f.key === "termsOfDelivery" ? "sm:col-span-2" : undefined}>
          <Input type={f.type ?? "text"} value={form[f.key]} onChange={(e) => onChange({ ...form, [f.key]: e.target.value })} />
        </Field>
      ))}
    </div>
  );
}

export function despatchPayload(form: DespatchForm) {
  const out: Record<string, string | null> = {};
  for (const f of DESPATCH_FIELDS) out[f.key] = form[f.key].trim() || null;
  return out;
}

export function DespatchDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  withDate,
  submitText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initial?: Partial<DespatchFields> | null;
  withDate?: boolean;
  submitText: string;
  onSubmit: (form: DespatchForm) => Promise<void>;
}) {
  const [form, setForm] = useState<DespatchForm>(() => emptyDespatch(initial));
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setForm(emptyDespatch(initial));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch {
      // caller shows the error
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <DespatchFieldsGrid form={form} onChange={setForm} withDate={withDate} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
