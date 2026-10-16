"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/page-header";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { EntityPicker } from "@/components/common/entity-picker";
import { RequirePermission } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { todayIST } from "@/lib/dates";
import { formatQty } from "@/lib/format";
import type { ProductRow } from "@/app/(app)/products/types";
import { ProductPicker } from "../../product-picker";

type Customer = {
  id: number;
  code: string;
  name: string;
  companyName: string | null;
  mobile: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  city: string | null;
};

type Line = { key: number; product: ProductRow | null; quantity: string };
let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, product: null, quantity: "1" });

export default function NewDisplayPage() {
  return (
    <RequirePermission permission="inventory.display">
      <PageHeader title="Send stock for display" back={{ href: "/inventory/display", label: "Potential Sales" }} />
      <DisplayForm />
    </RequirePermission>
  );
}

function DisplayForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const { canAny } = useSession();
  const [form, setForm] = useState({
    date: todayIST(),
    customerId: null as number | null,
    customerName: "",
    locationName: "",
    address: "",
    contactPerson: "",
    contactPhone: "",
    expectedReturnDate: "",
    remarks: "",
  });
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Picking a customer fills empty location/contact fields from the customer record.
  function pickCustomer(c: Customer | null) {
    setForm((f) => ({
      ...f,
      customerId: c?.id ?? null,
      customerName: c ? c.name : "",
      locationName: f.locationName || (c ? [c.companyName || c.name, c.city].filter(Boolean).join(", ") : ""),
      address: f.address || c?.shippingAddress || c?.billingAddress || "",
      contactPerson: f.contactPerson || c?.name || "",
      contactPhone: f.contactPhone || c?.mobile || "",
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = lines.filter((l) => l.product);
    if (!filled.length) {
      toast.error("Add at least one product");
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const created = await api.post<{ id: number; displayNo: string }>("/api/inventory/display", {
        date: form.date,
        customerId: form.customerId,
        locationName: form.locationName,
        address: form.address,
        contactPerson: form.contactPerson,
        contactPhone: form.contactPhone,
        expectedReturnDate: form.expectedReturnDate || null,
        remarks: form.remarks,
        items: filled.map((l) => ({ productId: l.product!.id, quantity: l.quantity })),
      });
      toast.success(`Display ${created.displayNo} created`);
      for (const k of ["displays", "products", "product", "inventory-summary", "inventory-ledger"]) qc.invalidateQueries({ queryKey: [k] });
      router.push(`/inventory/display/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormSection title="Where is it going?">
        <FormGrid>
          <Field label="Date" required error={errors.date}>
            <Input type="date" value={form.date} max={todayIST()} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          {canAny(["customers.view", "sales.create"]) && (
            <Field label="Customer" error={errors.customerId} hint="Optional" className="sm:col-span-2">
              <EntityPicker<Customer>
                endpoint="/api/customers"
                value={form.customerId}
                selectedLabel={form.customerName}
                onChange={(o) => pickCustomer(o?.raw ?? null)}
                toOption={(c) => ({ value: c.id, label: c.name, sub: [c.code, c.mobile, c.city].filter(Boolean).join(" · "), raw: c })}
                placeholder="Choose customer"
                searchPlaceholder="Search name, mobile, code…"
              />
            </Field>
          )}
          <Field label="Location name" required error={errors.locationName} className="sm:col-span-2">
            <Input
              value={form.locationName}
              onChange={(e) => set("locationName", e.target.value)}
              maxLength={200}
              placeholder="e.g. Mehra Residence, DLF Phase 2"
              required
            />
          </Field>
          <Field label="Expected return date" error={errors.expectedReturnDate}>
            <Input type="date" value={form.expectedReturnDate} min={form.date} onChange={(e) => set("expectedReturnDate", e.target.value)} />
          </Field>
          <Field label="Address" error={errors.address} className="sm:col-span-2 lg:col-span-3">
            <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={500} />
          </Field>
          <Field label="Contact person" error={errors.contactPerson}>
            <Input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} maxLength={100} />
          </Field>
          <Field label="Contact phone" error={errors.contactPhone}>
            <Input type="tel" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} maxLength={30} />
          </Field>
          <Field label="Remarks" error={errors.remarks}>
            <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} maxLength={1000} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Items" description="Stock moves from the showroom to 'on display' until it is returned or sold.">
        <div className="space-y-2">
          {lines.map((l) => {
            const over = !!l.product && (Number(l.quantity) || 0) > l.product.currentStock;
            return (
              <div key={l.key} className="grid grid-cols-[1fr_6rem_auto] items-start gap-2">
                <div className="min-w-0">
                  <ProductPicker value={l.product?.id ?? null} selected={l.product} onChange={(p) => setLine(l.key, { product: p })} />
                  {l.product && (
                    <div className={over ? "mt-0.5 text-xs text-red-700" : "mt-0.5 text-xs text-muted-foreground"}>
                      In showroom: {formatQty(l.product.currentStock)}
                      {over && " — not enough stock"}
                    </div>
                  )}
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  value={l.quantity}
                  onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                  className="h-9 text-right"
                  aria-label="Quantity"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}
                  aria-label="Remove line"
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" className="mt-3" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
          <Plus /> Add item
        </Button>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Send for display"}
        </Button>
      </div>
    </form>
  );
}
