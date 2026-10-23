"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/page-header";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { RequirePermission } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { useMeta } from "@/hooks/use-meta";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { todayIST } from "@/lib/dates";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductRow } from "@/app/(app)/products/types";
import { ADJUSTMENT_REASONS } from "../../constants";
import { ProductPicker } from "../../product-picker";

export default function NewAdjustmentPage() {
  return (
    <RequirePermission permission="inventory.adjust">
      <PageHeader title="New stock adjustment" back={{ href: "/inventory/adjustments", label: "Stock Adjustments" }} />
      <AdjustmentForm />
    </RequirePermission>
  );
}

function AdjustmentForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: meta } = useMeta();
  const [product, setProduct] = useState<ProductRow | null>(null);
  const { can } = useSession();
  const canApprove = can("inventory.approve");
  const [form, setForm] = useState({ date: todayIST(), type: "DECREASE", quantity: "", reason: "", remarks: "" });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const qty = Number(form.quantity) || 0;
  const current = product?.currentStock ?? 0;
  const resulting = form.type === "INCREASE" ? current + qty : current - qty;
  const willGoNegative = !!product && resulting < 0 && !meta?.inventory.allowNegativeStock;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const created = await api.post<{ adjustmentNo: string; status: string }>("/api/inventory/adjustments", {
        ...form,
        productId: product?.id ?? null,
      });
      toast.success(
        created.status === "PENDING"
          ? `Adjustment ${created.adjustmentNo} sent to a manager for approval`
          : `Adjustment ${created.adjustmentNo} saved; stock updated`,
      );
      for (const k of ["adjustments", "products", "product", "inventory-summary", "inventory-ledger"]) qc.invalidateQueries({ queryKey: [k] });
      router.push("/inventory/adjustments");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormSection title="Adjustment" description="Use this to correct showroom stock after a physical count or an entry mistake.">
        <FormGrid>
          <Field label="Product" required error={errors.productId} className="sm:col-span-2">
            <ProductPicker value={product?.id ?? null} selected={product} onChange={setProduct} invalid={!!errors.productId} />
          </Field>
          <Field label="Date" required error={errors.date}>
            <Input type="date" value={form.date} max={todayIST()} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field label="Type" required error={errors.type}>
            <div className="grid grid-cols-2 gap-1 rounded-md border p-0.5">
              {(["INCREASE", "DECREASE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("type", t)}
                  className={cn(
                    "h-8 rounded text-sm font-medium transition-colors",
                    form.type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t === "INCREASE" ? "Increase (+)" : "Decrease (−)"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Quantity" required error={errors.quantity}>
            <Input type="number" inputMode="decimal" step="1" min="0" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} required />
          </Field>
          <Field label={canApprove ? "Stock" : "Stock after approval"} hint={product?.onDisplayStock ? `${formatQty(product.onDisplayStock)} more out on display (not affected)` : undefined}>
            <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm tabular-nums">
              {product ? (
                <>
                  <span>{formatQty(current)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className={cn("font-semibold", resulting < 0 && "text-red-700")}>{formatQty(resulting)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Choose a product</span>
              )}
            </div>
          </Field>
          <Field label="Reason" required error={errors.reason}>
            <SimpleSelect
              value={form.reason}
              onChange={(v) => set("reason", v)}
              options={ADJUSTMENT_REASONS.map((r) => ({ value: r, label: r }))}
              placeholder="Choose reason"
              invalid={!!errors.reason}
            />
          </Field>
          <Field label="Remarks" required={form.reason === "Other"} error={errors.remarks} className="sm:col-span-2 lg:col-span-3">
            <Textarea rows={2} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} maxLength={1000} />
          </Field>
        </FormGrid>
        {willGoNegative && <p className="mt-3 text-sm text-red-700">Stock cannot go below zero. Reduce the quantity.</p>}
        <p className="mt-3 text-sm text-muted-foreground">
          {canApprove
            ? "Stock changes as soon as you save. You are recorded as the approver."
            : "This goes to a manager for approval. Stock changes only after it is approved."}
        </p>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || willGoNegative}>
          {busy ? "Saving…" : canApprove ? "Save adjustment" : "Send for approval"}
        </Button>
      </div>
    </form>
  );
}
