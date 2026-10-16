"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DetailList, ErrorBlock, LoadingBlock, Money, RequirePermission } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { useSession } from "@/components/session-provider";
import { api, errorMessage } from "@/lib/api-client";
import { formatAmount, formatDate, formatDateTime, formatPercent } from "@/lib/format";
import type { CreditNoteDetail } from "../../types";

export default function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission={["creditNotes.manage", "invoices.view"]}>
      <CreditNoteView id={Number(id)} />
    </RequirePermission>
  );
}

function CreditNoteView({ id }: { id: number }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const { data: cn, isLoading, error } = useQuery({
    queryKey: ["credit-note", id],
    queryFn: () => api.get<CreditNoteDetail>(`/api/credit-notes/${id}`),
  });
  if (isLoading) return <LoadingBlock rows={5} />;
  if (error || !cn) return <ErrorBlock error={error} />;

  async function cancel() {
    if (!cn) return;
    const reason = await confirm({
      title: `Cancel credit note ${cn.creditNoteNo}?`,
      description: "The invoice balance goes back up by this amount.",
      confirmText: "Cancel credit note",
      destructive: true,
      reason: { label: "Reason" },
    });
    if (!reason) return;
    try {
      await api.post(`/api/credit-notes/${id}/cancel`, { reason });
      toast.success("Credit note cancelled");
      qc.invalidateQueries({ queryKey: ["credit-note", id] });
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      qc.invalidateQueries({ queryKey: ["invoice", cn.invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title={`Credit note ${cn.creditNoteNo}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={cn.status} />
            <span>{formatDate(cn.date)}</span>
            <span>·</span>
            <span>{cn.invoice.order.customerName}</span>
          </span>
        }
        back={{ href: "/sales/credit-notes", label: "Credit notes" }}
      >
        <Button variant="outline" onClick={() => window.open(`/print/credit-notes/${id}`, "_blank", "noopener")}>
          <Printer /> Print / Download PDF
        </Button>
        {cn.status === "ACTIVE" && can("creditNotes.manage") && (
          <Button variant="destructive" onClick={cancel}>
            <Ban /> Cancel
          </Button>
        )}
      </PageHeader>

      <div className="space-y-4">
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <DetailList
            className="lg:grid-cols-3"
            items={[
              { label: "Against invoice", value: <Link href={`/sales/invoices/${cn.invoiceId}`} className="hover:underline">{cn.invoice.invoiceNo} ({formatDate(cn.invoice.invoiceDate)})</Link> },
              { label: "Customer", value: cn.invoice.order.customerName },
              { label: "GSTIN", value: cn.invoice.order.customerGstin },
              { label: "Place of supply", value: `${cn.invoice.order.placeOfSupply} (${cn.invoice.order.placeOfSupplyCode})` },
              { label: "Reason", value: cn.reason },
              { label: "Issued", value: `${formatDateTime(cn.createdAt)}${cn.createdBy ? ` by ${cn.createdBy.name}` : ""}` },
            ]}
          />
        </section>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="border-b">
                <th className="h-9 px-3 text-left font-medium">Item</th>
                <th className="px-3 text-left font-medium">HSN</th>
                <th className="px-3 text-right font-medium">GST</th>
                <th className="px-3 text-right font-medium">Taxable</th>
                <th className="px-3 text-right font-medium">{cn.isInterState ? "IGST" : "CGST + SGST"}</th>
                <th className="px-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {cn.items.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{i.description}</td>
                  <td className="px-3 py-2">{i.hsnCode ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatPercent(i.gstRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(i.taxableValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(i.cgstAmount + i.sgstAmount + i.igstAmount + i.cessAmount)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatAmount(i.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30 font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(cn.taxableTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(cn.taxTotal)}</td>
                <td className="px-3 py-2 text-right">
                  <Money value={cn.total} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">{cn.totalInWords}</p>
      </div>
    </>
  );
}
