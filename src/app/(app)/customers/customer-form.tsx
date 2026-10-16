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
import { CUSTOMER_TYPE_OPTIONS, type CustomerDetail, type CustomerTypeName } from "./types";

type FormState = {
  name: string;
  customerType: CustomerTypeName;
  companyName: string;
  mobile: string;
  altMobile: string;
  email: string;
  gstin: string;
  pan: string;
  billingAddress: string;
  shippingAddress: string;
  sameAsBilling: boolean;
  city: string;
  stateCode: string;
  pincode: string;
  country: string;
  creditLimit: string;
  paymentTermsDays: string;
  openingBalance: string;
  notes: string;
  isActive: boolean;
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function CustomerForm({ customer }: { customer?: CustomerDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const isEdit = !!customer;
  const readOnly = isEdit ? !can("customers.edit") : !can("customers.create");

  const [form, setForm] = useState<FormState>(() => ({
    name: s(customer?.name),
    customerType: customer?.customerType ?? "INDIVIDUAL",
    companyName: s(customer?.companyName),
    mobile: s(customer?.mobile),
    altMobile: s(customer?.altMobile),
    email: s(customer?.email),
    gstin: s(customer?.gstin),
    pan: s(customer?.pan),
    billingAddress: s(customer?.billingAddress),
    shippingAddress: s(customer?.shippingAddress),
    sameAsBilling: !customer || !customer.shippingAddress || customer.shippingAddress === customer.billingAddress,
    city: s(customer?.city),
    stateCode: customer?.stateCode ?? stateByName(customer?.state)?.code ?? "",
    pincode: s(customer?.pincode),
    country: customer ? s(customer.country) : "India",
    creditLimit: s(customer?.creditLimit),
    paymentTermsDays: s(customer?.paymentTermsDays),
    openingBalance: s(customer?.openingBalance ?? ""),
    notes: s(customer?.notes),
    isActive: customer?.isActive ?? true,
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
      // The first two digits of a GSTIN are the state code; PAN is characters 3–12.
      ...(code && gstin.length >= 2 ? { stateCode: code } : {}),
      ...(gstin.length === 15 && !f.pan ? { pan: gstin.slice(2, 12) } : {}),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const { sameAsBilling, stateCode, ...rest } = form;
    const payload = {
      ...rest,
      shippingAddress: sameAsBilling ? form.billingAddress : form.shippingAddress,
      stateCode: stateCode || null,
      state: stateByCode(stateCode)?.name ?? null,
      creditLimit: form.creditLimit || null,
      paymentTermsDays: form.paymentTermsDays || null,
      openingBalance: form.openingBalance || 0,
    };
    try {
      if (isEdit) {
        await api.patch(`/api/customers/${customer.id}`, payload);
        toast.success("Customer updated");
        qc.invalidateQueries({ queryKey: ["customer", customer.id] });
        qc.invalidateQueries({ queryKey: ["customers"] });
        router.push(`/customers/${customer.id}`);
      } else {
        const created = await api.post<{ id: number; code: string }>("/api/customers", payload);
        toast.success(`Customer ${created.code} created`);
        qc.invalidateQueries({ queryKey: ["customers"] });
        router.push(`/customers/${created.id}`);
      }
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
        <FormSection title="Customer">
          <FormGrid>
            <Field label="Customer ID" hint={isEdit ? undefined : "Assigned automatically when saved"}>
              <Input value={customer?.code ?? "Auto"} readOnly disabled className="font-mono" />
            </Field>
            <Field label="Name" required htmlFor="name" error={errors.name}>
              <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required autoFocus={!isEdit} />
            </Field>
            <Field label="Customer type" required error={errors.customerType}>
              <SimpleSelect value={form.customerType} onChange={(v) => set("customerType", v as CustomerTypeName)} options={CUSTOMER_TYPE_OPTIONS} />
            </Field>
            <Field label="Company / firm" htmlFor="companyName" error={errors.companyName}>
              <Input id="companyName" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </Field>
            <Field label="Mobile" htmlFor="mobile" error={errors.mobile} hint="Optional">
              <Input id="mobile" type="tel" inputMode="tel" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
            </Field>
            <Field label="Alternate mobile" htmlFor="altMobile" error={errors.altMobile}>
              <Input id="altMobile" type="tel" inputMode="tel" value={form.altMobile} onChange={(e) => set("altMobile", e.target.value)} />
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
          </FormGrid>
        </FormSection>

        <FormSection title="Address">
          <FormGrid cols={2}>
            <Field label="Billing address" htmlFor="billingAddress" error={errors.billingAddress}>
              <Textarea id="billingAddress" rows={3} value={form.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} />
            </Field>
            <Field label="Shipping address" htmlFor="shippingAddress" error={errors.shippingAddress}>
              <Textarea
                id="shippingAddress"
                rows={3}
                value={form.sameAsBilling ? form.billingAddress : form.shippingAddress}
                onChange={(e) => set("shippingAddress", e.target.value)}
                disabled={form.sameAsBilling}
              />
              <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  size="sm"
                  checked={form.sameAsBilling}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, sameAsBilling: v, shippingAddress: v ? f.shippingAddress : f.shippingAddress || f.billingAddress }))
                  }
                />
                Same as billing address
              </label>
            </Field>
          </FormGrid>
          <FormGrid cols={4} className="mt-4">
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
            <Field label="Country" htmlFor="country" error={errors.country}>
              <Input id="country" value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Credit and balance">
          <FormGrid cols={4}>
            <Field label="Credit limit (₹)" htmlFor="creditLimit" error={errors.creditLimit}>
              <Input id="creditLimit" type="number" step="0.01" min="0" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
            </Field>
            <Field label="Payment terms (days)" htmlFor="paymentTermsDays" error={errors.paymentTermsDays} hint="Blank = default from settings">
              <Input id="paymentTermsDays" type="number" step="1" min="0" value={form.paymentTermsDays} onChange={(e) => set("paymentTermsDays", e.target.value)} />
            </Field>
            <Field label="Opening balance (₹)" htmlFor="openingBalance" error={errors.openingBalance} hint="Amount due from before this system">
              <Input id="openingBalance" type="number" step="0.01" value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} />
            </Field>
            {isEdit && (
              <Field label="Active" hint={customer.isWalkIn ? "The walk-in customer is always active" : "Inactive customers cannot be billed"}>
                <div className="flex h-9 items-center">
                  <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} disabled={customer.isWalkIn} />
                </div>
              </Field>
            )}
            <Field label="Notes" htmlFor="notes" error={errors.notes} className="sm:col-span-2 lg:col-span-4">
              <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </FormGrid>
        </FormSection>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create customer"}
          </Button>
        </div>
      )}
    </form>
  );
}
