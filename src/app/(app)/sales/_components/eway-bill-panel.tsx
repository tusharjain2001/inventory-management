"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileText, Pencil, TriangleAlert, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/common/confirm";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InvoiceDetail } from "../types";

const PORTAL = "https://ewaybillgst.gov.in";

/**
 * E-way bill box on the invoice: a reminder while one is needed and missing, then the number,
 * date and the uploaded PDF from the government portal. Hidden when no e-way bill is involved.
 */
export function EWayBillPanel({
  inv,
  canManage,
  onEditNumber,
  onChanged,
}: {
  inv: InvoiceDetail;
  canManage: boolean;
  onEditNumber: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { status, threshold } = inv.eWayBill;
  if (status === "NOT_REQUIRED" && !inv.eWayBillFileUrl) return null;
  const pending = status === "PENDING";

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/invoices/${inv.id}/eway-bill`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Upload failed");
      toast.success("E-way bill file saved");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function removeFile() {
    if (!(await confirm({ title: "Remove the e-way bill file?", confirmText: "Remove", destructive: true }))) return;
    try {
      await api.delete(`/api/invoices/${inv.id}/eway-bill`);
      toast.success("E-way bill file removed");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <section
      className={cn(
        "mb-4 rounded-lg border px-4 py-3 text-sm",
        pending ? "border-amber-200 bg-amber-50 text-amber-950" : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        {pending ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" /> : <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-60 flex-1 space-y-1">
          {pending ? (
            <>
              <div className="font-semibold">E-way bill needed</div>
              <div>
                {inv.order.isInterState ? "Goods are going to another state" : "This sale"} and the invoice is above {formatINR(threshold)}. Generate the
                e-way bill on{" "}
                <a href={PORTAL} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  ewaybillgst.gov.in
                </a>{" "}
                using this invoice, then enter its number here and upload the PDF.
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">E-Way Bill</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  No. <b className="font-mono">{inv.eWayBillNo ?? "—"}</b>
                </span>
                {inv.eWayBillDate && <span>Dated {formatDate(inv.eWayBillDate)}</span>}
                {inv.vehicleNo && <span>Vehicle {inv.vehicleNo}</span>}
                {!inv.eWayBillFileUrl && <span className="text-muted-foreground">PDF not uploaded</span>}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {inv.eWayBillFileUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={inv.eWayBillFileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> View E-Way Bill
              </a>
            </Button>
          )}
          {canManage && (
            <>
              <Button size="sm" variant={pending ? "default" : "outline"} onClick={onEditNumber}>
                <Pencil /> {inv.eWayBillNo ? "Edit Number" : "Enter Number"}
              </Button>
              <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
                <Upload /> {busy ? "Uploading…" : inv.eWayBillFileUrl ? "Replace PDF" : "Upload PDF"}
              </Button>
              {inv.eWayBillFileUrl && (
                <Button size="icon-sm" variant="ghost" onClick={removeFile} aria-label="Remove e-way bill file">
                  <Trash2 />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
