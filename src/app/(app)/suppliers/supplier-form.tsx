"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { useSession } from "@/components/session-provider";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { INDIAN_STATES, stateByCode, stateByName, stateCodeFromGstin } from "@/lib/india";
import type { SupplierRow } from "./types";

type FormState = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstin: string;
  pan: string;
  address: string;
  city: string;
  stateCode: string;
  pincode: string;
  notes: string;
  isActive: boolean;
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function SupplierForm({ supplier }: { supplier?: SupplierRow }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const isEdit = !!supplier;
  const readOnly = !can("suppliers.manage");

  const [form, setForm] = useState<FormState>(() => ({
    name: s(supplier?.name),
    contactPerson: s(supplier?.contactPerson),
    phone: s(supplier?.phone),
    email: s(supplier?.email),
    gstin: s(supplier?.gstin),
    pan: s(supplier?.pan),
    address: s(supplier?.address),
    city: s(supplier?.city),
    stateCode: supplier?.stateCode ?? stateByName(supplier?.state)?.code ?? "",
    pincode: s(supplier?.pincode),
    notes: s(supplier?.notes),
    isActive: supplier?.isActive ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function onGstin(value: string) {
    const gstin = value.toUpperCase().replace(/\s/g, "");
    const code = stateCodeFromGstin(gstin);
    setForm((f) => ({
      ...f,
      gstin,
      ...(code ? { stateCode: code } : {}),
      ...(gstin.length === 15 && !f.pan ? { pan: gstin.slice(2, 12) } : {}),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const { stateCode, ...rest } = form;
    const payload = { ...rest, stateCode: stateCode || null, state: stateByCode(stateCode)?.name ?? null };
    try {
      if (isEdit) {
        await api.patch(`/api/suppliers/${supplier.id}`, payload);
        toast.success("Supplier updated");
        qc.invalidateQueries({ queryKey: ["supplier", supplier.id] });
      } else {
        const created = await api.post<{ id: number }>("/api/suppliers", payload);
        toast.success("Supplier created");
        router.push(`/suppliers/${created.id}`);
      }
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset disabled={readOnly} className="space-y-4">
        <FormSection title="Supplier">
          <FormGrid>
            <Field label="Name" required htmlFor="name" error={errors.name}>
              <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required autoFocus={!isEdit} />
            </Field>
            <Field label="Contact person" htmlFor="contactPerson" error={errors.contactPerson}>
              <Input id="contactPerson" value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="GSTIN" htmlFor="gstin" error={errors.gstin} hint="Fills the state automatically">
              <Input id="gstin" value={form.gstin} onChange={(e) => onGstin(e.target.value)} maxLength={15} className="font-mono uppercase" />
            </Field>
            <Field label="PAN" htmlFor="pan" error={errors.pan}>
              <Input id="pan" value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} maxLength={10} className="font-mono uppercase" />
            </Field>
            <Field label="Address" htmlFor="address" error={errors.address} className="sm:col-span-2 lg:col-span-3">
              <Textarea id="address" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="City" htmlFor="city" error={errors.city}>
              <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="State" error={errors.state ?? errors.stateCode} hint={form.stateCode ? `State code ${form.stateCode}` : undefined}>
              <SimpleSelect
                value={form.stateCode}
                onChange={(v) => set("stateCode", v)}
                clearLabel="Not set"
                placeholder="Choose state"
                options={INDIAN_STATES.map((st) => ({ value: st.code, label: st.name }))}
              />
            </Field>
            <Field label="PIN code" htmlFor="pincode" error={errors.pincode}>
              <Input id="pincode" inputMode="numeric" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} maxLength={10} />
            </Field>
            <Field label="Notes" htmlFor="notes" error={errors.notes} className="sm:col-span-2">
              <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
            {isEdit && (
              <Field label="Active" hint="Inactive suppliers are hidden from stock-in">
                <div className="flex h-9 items-center">
                  <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
                </div>
              </Field>
            )}
          </FormGrid>
        </FormSection>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isEdit && (
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create supplier"}
          </Button>
        </div>
      )}
    </form>
  );
}
