"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/common/page-header";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { EntityPicker } from "@/components/common/entity-picker";
import { RequirePermission } from "@/components/common/misc";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { round2 } from "@/lib/calc";
import { todayIST } from "@/lib/dates";
import { formatINR, formatQty, label } from "@/lib/format";
import type { ProductRow } from "@/app/(app)/products/types";
import { STOCK_IN_SOURCES } from "../../constants";
import { ProductPicker } from "../../product-picker";

type Supplier = { id: number; name: string; gstin: string | null; city: string | null };

type Line = {
  key: number;
  product: ProductRow | null;
  quantity: string;
  unitCost: string;
  discountAmount: string;
  gstRate: string;
  batchNo: string;
};

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, product: null, quantity: "1", unitCost: "", discountAmount: "", gstRate: "", batchNo: "" });

/** Same maths as the server: taxable = qty × cost − discount, GST on taxable. */
function lineTotals(l: Line) {
  const gross = round2((Number(l.quantity) || 0) * (Number(l.unitCost) || 0));
  const discount = round2(Number(l.discountAmount) || 0);
  const taxable = round2(gross - discount);
  const gst = round2((taxable * (Number(l.gstRate) || 0)) / 100);
  return { gross, discount, taxable, gst, total: round2(taxable + gst) };
}

export default function NewStockInPage() {
  return (
    <RequirePermission permission="inventory.stockIn">
      <PageHeader title="New Stock In" back={{ href: "/inventory/stock-in", label: "Stock In / Purchases" }} />
      <StockInForm />
    </RequirePermission>
  );
}

function StockInForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    date: todayIST(),
    source: "PURCHASE",
    supplierId: null as number | null,
    supplierName: "",
    purchaseInvoiceNo: "",
    purchaseInvoiceDate: "",
    remarks: "",
    updatePurchasePrice: true,
  });
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickProduct(key: number, p: ProductRow | null) {
    setLine(key, {
      product: p,
      // Prefill from the product master (purchase price only when the user may see it).
      unitCost: p?.purchasePrice !== undefined ? String(p.purchasePrice) : "",
      gstRate: p ? String(p.taxType === "GST" ? p.gstRate : 0) : "",
    });
  }

  const totals = lines.map(lineTotals);
  const sum = (f: (t: ReturnType<typeof lineTotals>) => number) => round2(totals.reduce((s, t) => s + f(t), 0));
  const isPurchase = form.source === "PURCHASE";

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
      const created = await api.post<{ id: number; stockInNo: string }>("/api/inventory/stock-in", {
        date: form.date,
        source: form.source,
        supplierId: form.supplierId,
        purchaseInvoiceNo: form.purchaseInvoiceNo,
        purchaseInvoiceDate: form.purchaseInvoiceDate || null,
        remarks: form.remarks,
        updatePurchasePrice: form.updatePurchasePrice,
        items: filled.map((l) => ({
          productId: l.product!.id,
          quantity: l.quantity,
          unitCost: l.unitCost || 0,
          discountAmount: l.discountAmount || 0,
          gstRate: l.gstRate === "" ? null : l.gstRate,
          batchNo: l.batchNo,
        })),
      });
      toast.success(`Stock in ${created.stockInNo} saved`);
      for (const k of ["stock-ins", "products", "product", "inventory-summary", "inventory-ledger"]) qc.invalidateQueries({ queryKey: [k] });
      router.push(`/inventory/stock-in/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormSection title="Details">
        <FormGrid cols={4}>
          <Field label="Date" required error={errors.date}>
            <Input type="date" value={form.date} max={todayIST()} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field label="Source" required error={errors.source}>
            <SimpleSelect value={form.source} onChange={(v) => set("source", v)} options={STOCK_IN_SOURCES.map((s) => ({ value: s, label: label(s) }))} />
          </Field>
          <Field label="Supplier" required={isPurchase} error={errors.supplierId} className="sm:col-span-2">
            <EntityPicker<Supplier>
              endpoint="/api/suppliers"
              value={form.supplierId}
              selectedLabel={form.supplierName}
              onChange={(o) => setForm((f) => ({ ...f, supplierId: o?.value ?? null, supplierName: o?.label ?? "" }))}
              toOption={(s) => ({ value: s.id, label: s.name, sub: [s.gstin, s.city].filter(Boolean).join(" · "), raw: s })}
              placeholder="Choose Supplier"
              searchPlaceholder="Search supplier name, GSTIN…"
              invalid={!!errors.supplierId}
            />
          </Field>
          <Field label="Purchase Invoice No" error={errors.purchaseInvoiceNo}>
            <Input value={form.purchaseInvoiceNo} onChange={(e) => set("purchaseInvoiceNo", e.target.value)} maxLength={60} />
          </Field>
          <Field label="Purchase Invoice Date" error={errors.purchaseInvoiceDate}>
            <Input type="date" value={form.purchaseInvoiceDate} max={todayIST()} onChange={(e) => set("purchaseInvoiceDate", e.target.value)} />
          </Field>
          <Field label="Update Product Purchase Price" hint="Set each product's purchase price to this cost (after discount, excl. GST)" className="sm:col-span-2">
            <div className="flex h-9 items-center">
              <Switch checked={form.updatePurchasePrice} onCheckedChange={(v) => set("updatePurchasePrice", v)} />
            </div>
          </Field>
          <Field label="Remarks" error={errors.remarks} className="sm:col-span-2 lg:col-span-4">
            <Textarea rows={2} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} maxLength={1000} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Items" description="Unit cost is per unit before GST. Discount is the total for the line.">
        <div className="hidden grid-cols-12 gap-2 px-1 pb-1 text-xs font-medium text-muted-foreground lg:grid">
          <div className="col-span-4">Product</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-2 text-right">Unit Cost (₹)</div>
          <div className="col-span-1 text-right">Discount (₹)</div>
          <div className="col-span-1 text-right">GST %</div>
          <div className="col-span-1">Batch</div>
          <div className="col-span-2 text-right">Line Total</div>
        </div>
        <div className="space-y-3 lg:space-y-2">
          {lines.map((l, i) => {
            const t = totals[i];
            return (
              <div key={l.key} className="grid grid-cols-2 gap-2 rounded-md border p-2 lg:grid-cols-12 lg:items-center lg:border-0 lg:p-0">
                <div className="col-span-2 lg:col-span-4">
                  <ProductPicker value={l.product?.id ?? null} selected={l.product} onChange={(p) => pickProduct(l.key, p)} />
                  {l.product && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      In stock {formatQty(l.product.currentStock)}
                      {l.product.avgCost !== undefined && <> · Avg cost {formatINR(l.product.avgCost)}</>}
                    </div>
                  )}
                </div>
                <LineInput label="Qty" className="lg:col-span-1" value={l.quantity} onChange={(v) => setLine(l.key, { quantity: v })} step="1" min="0" />
                <LineInput label="Unit Cost (₹)" className="lg:col-span-2" value={l.unitCost} onChange={(v) => setLine(l.key, { unitCost: v })} step="0.01" min="0" />
                <LineInput label="Discount (₹)" className="lg:col-span-1" value={l.discountAmount} onChange={(v) => setLine(l.key, { discountAmount: v })} step="0.01" min="0" />
                <LineInput label="GST %" className="lg:col-span-1" value={l.gstRate} onChange={(v) => setLine(l.key, { gstRate: v })} step="0.01" min="0" />
                <div className="lg:col-span-1">
                  <span className="mb-1 block text-xs text-muted-foreground lg:hidden">Batch</span>
                  <Input value={l.batchNo} onChange={(e) => setLine(l.key, { batchNo: e.target.value })} maxLength={60} className="h-9" />
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2 lg:col-span-2 lg:justify-end">
                  <div className="text-right text-sm tabular-nums">
                    <div className="font-medium">{formatINR(t.total)}</div>
                    {t.gst > 0 && <div className="text-xs text-muted-foreground">incl. GST {formatINR(t.gst)}</div>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}
                    aria-label="Remove line"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" className="mt-3" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
          <Plus /> Add Item
        </Button>

        <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm tabular-nums">
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="text-right">{formatINR(sum((t) => t.gross))}</dd>
          <dt className="text-muted-foreground">Discount</dt>
          <dd className="text-right">−{formatINR(sum((t) => t.discount))}</dd>
          <dt className="text-muted-foreground">Taxable Value</dt>
          <dd className="text-right">{formatINR(sum((t) => t.taxable))}</dd>
          <dt className="text-muted-foreground">GST</dt>
          <dd className="text-right">{formatINR(sum((t) => t.gst))}</dd>
          <dt className="border-t pt-1 font-semibold">Total</dt>
          <dd className="border-t pt-1 text-right font-semibold">{formatINR(sum((t) => t.total))}</dd>
        </dl>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          Saved stock-ins cannot be edited or deleted. Use an adjustment to correct mistakes.
        </p>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save Stock In"}
        </Button>
      </div>
    </form>
  );
}

function LineInput({
  label,
  value,
  onChange,
  className,
  step,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  step?: string;
  min?: string;
}) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs text-muted-foreground lg:hidden">{label}</span>
      <Input type="number" inputMode="decimal" step={step} min={min} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-right" aria-label={label} />
    </div>
  );
}
