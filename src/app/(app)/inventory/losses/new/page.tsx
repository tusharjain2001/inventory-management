"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/page-header";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { RequirePermission } from "@/components/common/misc";
import { useMeta } from "@/hooks/use-meta";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { compressImage } from "@/lib/image";
import { todayIST } from "@/lib/dates";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductRow } from "@/app/(app)/products/types";
import { ProductPicker } from "../../product-picker";

export default function NewLossPage() {
  return (
    <RequirePermission permission="inventory.damageLoss">
      <PageHeader title="Record Damaged / Lost Stock" back={{ href: "/inventory/losses", label: "Damaged / Lost" }} />
      <LossForm />
    </RequirePermission>
  );
}

function LossForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: meta } = useMeta();
  const fileInput = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [form, setForm] = useState({
    type: "DAMAGED" as "DAMAGED" | "LOST",
    date: todayIST(),
    quantity: "1",
    reason: "",
    location: "",
    remarks: "",
    approvedById: "",
  });
  const [attachment, setAttachment] = useState<{ url: string; path: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const approvers = (meta?.users ?? []).filter((u) => u.canApprove);
  const isLost = form.type === "LOST";

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.upload(await compressImage(file), "damages", file.name);
      setAttachment({ ...res, name: file.name });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const created = await api.post<{ lossNo: string }>("/api/inventory/losses", {
        ...form,
        productId: product?.id ?? null,
        approvedById: form.approvedById || null,
        attachmentUrl: attachment?.url ?? null,
        attachmentPath: attachment?.path ?? null,
      });
      toast.success(`${isLost ? "Lost" : "Damaged"} stock recorded (${created.lossNo})`);
      for (const k of ["losses", "products", "product", "inventory-summary", "inventory-ledger"]) qc.invalidateQueries({ queryKey: [k] });
      router.push("/inventory/losses");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormSection title="Details" description="The quantity is removed from showroom stock and written off at the average cost.">
        <FormGrid>
          <Field label="Type" required className="sm:col-span-2 lg:col-span-1">
            <div className="grid grid-cols-2 gap-1 rounded-md border p-0.5">
              {(["DAMAGED", "LOST"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("type", t)}
                  className={cn(
                    "h-8 rounded text-sm font-medium transition-colors",
                    form.type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t === "DAMAGED" ? "Damaged" : "Lost"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Product" required error={errors.productId} className="sm:col-span-2">
            <ProductPicker value={product?.id ?? null} selected={product} onChange={setProduct} invalid={!!errors.productId} />
          </Field>
          <Field label="Date" required error={errors.date}>
            <Input type="date" value={form.date} max={todayIST()} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field label="Quantity" required error={errors.quantity} hint={product ? `In showroom: ${formatQty(product.currentStock)}` : undefined}>
            <Input type="number" inputMode="decimal" step="1" min="0" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} required />
          </Field>
          <Field label="Approved by" required={isLost} error={errors.approvedById} hint={isLost ? "Required for lost stock" : undefined}>
            <SimpleSelect
              value={form.approvedById}
              onChange={(v) => set("approvedById", v)}
              options={approvers.map((u) => ({ value: String(u.id), label: `${u.name} (${u.roleName})` }))}
              clearLabel={isLost ? undefined : "Not Approved"}
              placeholder={isLost ? "Choose Approver" : "Not approved"}
              invalid={!!errors.approvedById}
            />
          </Field>
          <Field label="Reason" required error={errors.reason} className="sm:col-span-2">
            <Input
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              maxLength={500}
              placeholder={isLost ? "e.g. Missing after stock count" : "e.g. Scratched top during unloading"}
              required
            />
          </Field>
          <Field label={isLost ? "Last Known Location" : "Location"} error={errors.location}>
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={200} placeholder="e.g. Showroom floor, godown" />
          </Field>
          <Field label="Remarks" error={errors.remarks} className="sm:col-span-2">
            <Textarea rows={2} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} maxLength={1000} />
          </Field>
          <Field label="Photo / Document" hint="JPG, PNG, WEBP or PDF, up to 8 MB" error={errors.attachmentUrl}>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              hidden
              onChange={(e) => upload(e.target.files?.[0])}
            />
            {attachment ? (
              <div className="flex h-9 items-center gap-2 rounded-md border px-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <a href={attachment.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                  {attachment.name}
                </a>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => setAttachment(null)} aria-label="Remove attachment">
                  <X />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="h-9 w-full" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <Upload /> {uploading ? "Uploading…" : "Add Photo or File"}
              </Button>
            )}
          </Field>
        </FormGrid>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || uploading}>
          {busy ? "Saving…" : isLost ? "Record Lost Stock" : "Record Damaged Stock"}
        </Button>
      </div>
    </form>
  );
}
