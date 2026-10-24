"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { INDIAN_STATES, stateCodeFromGstin } from "@/lib/india";
import type { CustomerLite } from "../types";

/** Quick "New Customer" from the order screen: name, mobile, GSTIN, state, address. */
export function NewCustomerDialog({
  open,
  onOpenChange,
  defaultStateCode,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStateCode: string;
  onCreated: (c: CustomerLite) => void;
}) {
  const empty = { name: "", mobile: "", gstin: "", stateCode: defaultStateCode, billingAddress: "", city: "", pincode: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setErrors({});
    try {
      const created = await api.post<CustomerLite>("/api/customers", {
        name: form.name,
        mobile: form.mobile || null,
        gstin: form.gstin || null,
        stateCode: form.stateCode || null,
        billingAddress: form.billingAddress || null,
        city: form.city || null,
        pincode: form.pincode || null,
        customerType: form.gstin ? "BUSINESS" : "INDIVIDUAL",
      });
      toast.success(`Customer ${created.name} added`);
      onCreated(created);
      setForm(empty);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required error={errors.name} className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus required />
          </Field>
          <Field label="Mobile" error={errors.mobile} hint="Optional">
            <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} inputMode="tel" />
          </Field>
          <Field label="GSTIN" error={errors.gstin} hint="For business buyers">
            <Input
              value={form.gstin}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                const code = stateCodeFromGstin(v);
                setForm((f) => ({ ...f, gstin: v, stateCode: code ?? f.stateCode }));
              }}
              className="font-mono"
              maxLength={15}
            />
          </Field>
          <Field label="State" error={errors.stateCode} className="sm:col-span-2">
            <SimpleSelect
              value={form.stateCode}
              onChange={(v) => set("stateCode", v)}
              options={INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))}
            />
          </Field>
          <Field label="Address" error={errors.billingAddress} className="sm:col-span-2">
            <Textarea rows={2} value={form.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} />
          </Field>
          <Field label="City" error={errors.city}>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Pincode" error={errors.pincode}>
            <Input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} inputMode="numeric" />
          </Field>
          <DialogFooter className="sm:col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !form.name.trim()}>
              {busy ? "Saving…" : "Add Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
