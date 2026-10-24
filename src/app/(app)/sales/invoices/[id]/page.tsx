"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, FilePlus2, IndianRupee, Pencil, Printer, Trash2, Truck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DetailList, ErrorBlock, LoadingBlock, Money, RequirePermission, StatCard } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { useSession } from "@/components/session-provider";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, label } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ItemsTable, TotalsList } from "../../_components/order-summary";
import { PaymentDialog } from "../../_components/payment-dialog";
import { CreditNoteDialog } from "../../_components/credit-note-dialog";
import { DESPATCH_FIELDS, DespatchDialog, despatchPayload } from "../../_components/despatch-dialog";
import type { InvoiceDetail, PaymentRow } from "../../types";

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission={["invoices.view", "payments.view", "creditNotes.manage"]}>
      <InvoiceView id={Number(id)} />
    </RequirePermission>
  );
}

function InvoiceView({ id }: { id: number }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [payDialog, setPayDialog] = useState<{ type: "RECEIPT" | "REFUND"; payment?: PaymentRow } | null>(null);
  const [cnOpen, setCnOpen] = useState(false);
  const [despatchOpen, setDespatchOpen] = useState(false);
  const { data: inv, isLoading, error } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => api.get<InvoiceDetail>(`/api/invoices/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !inv) return <ErrorBlock error={error} />;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["invoice", id] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["credit-notes"] });
    qc.invalidateQueries({ queryKey: ["sales-orders"] });
    qc.invalidateQueries({ queryKey: ["sales-order", inv.orderId] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };
  const active = inv.status === "ACTIVE";

  async function cancelInvoice() {
    if (!inv) return;
    const reason = await confirm({
      title: `Cancel invoice ${inv.invoiceNo}?`,
      description: "The order is cancelled and its items go back into showroom stock. The invoice number is not reused.",
      confirmText: "Cancel Invoice",
      destructive: true,
      reason: { label: "Reason", placeholder: "Why is this invoice being cancelled?" },
    });
    if (!reason) return;
    try {
      await api.post(`/api/invoices/${id}/cancel`, { reason });
      toast.success("Invoice cancelled");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err), { duration: 8000 });
    }
  }

  async function deletePayment(p: PaymentRow) {
    const ok = await confirm({
      title: `Delete ${p.type === "REFUND" ? "refund" : "payment"} ${p.paymentNo}?`,
      description: "The invoice balance will be recalculated. The payment number is not reused.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/payments/${p.id}`);
      toast.success("Payment deleted");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function cancelCreditNote(cnId: number, no: string) {
    const reason = await confirm({
      title: `Cancel credit note ${no}?`,
      description: "The invoice balance goes back up by the credit note amount.",
      confirmText: "Cancel Credit Note",
      destructive: true,
      reason: { label: "Reason" },
    });
    if (!reason) return;
    try {
      await api.post(`/api/credit-notes/${cnId}/cancel`, { reason });
      toast.success("Credit note cancelled");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const despatchItems = DESPATCH_FIELDS.map((f) => ({
    label: f.label,
    value: f.type === "date" ? formatDate(inv[f.key]) : inv[f.key],
  }));

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.invoiceNo}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={inv.displayStatus} />
            <span>{formatDate(inv.invoiceDate)}</span>
            <span>·</span>
            <span>{inv.order.customerName}</span>
            <span>·</span>
            <Link href={`/sales/orders/${inv.orderId}`} className="hover:underline">
              {inv.order.orderNo}
            </Link>
          </span>
        }
        back={{ href: "/sales/invoices", label: "Invoices" }}
      >
        <Button variant="outline" onClick={() => window.open(`/print/invoices/${id}`, "_blank", "noopener")}>
          <Printer /> Print / Download PDF
        </Button>
        {active && can("payments.record") && inv.balanceDue > 0.005 && (
          <Button onClick={() => setPayDialog({ type: "RECEIPT" })}>
            <IndianRupee /> Record Payment
          </Button>
        )}
        {can("payments.record") && inv.amountPaid > 0.005 && (
          <Button variant="outline" onClick={() => setPayDialog({ type: "REFUND" })}>
            <Undo2 /> Refund
          </Button>
        )}
        {active && can("creditNotes.manage") && (
          <Button variant="outline" onClick={() => setCnOpen(true)}>
            <FilePlus2 /> Credit Note
          </Button>
        )}
        {can("invoices.manage") && (
          <Button variant="outline" onClick={() => setDespatchOpen(true)}>
            <Truck /> Despatch Details
          </Button>
        )}
        {active && can("sales.cancel") && (
          <Button variant="destructive" onClick={cancelInvoice}>
            <Ban /> Cancel
          </Button>
        )}
      </PageHeader>

      {!active && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          Cancelled {formatDateTime(inv.cancelledAt)}
          {inv.cancelledBy ? ` by ${inv.cancelledBy.name}` : ""}. Reason: {inv.cancelReason}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Invoice Total" value={<Money value={inv.grandTotal} />} />
        <StatCard label="Received (Net)" value={<Money value={inv.amountPaid} />} sub={`${inv.payments.length} payment${inv.payments.length === 1 ? "" : "s"}`} />
        <StatCard label="Credit Notes" value={<Money value={inv.creditNoteTotal} />} />
        <StatCard
          label="Balance Due"
          value={<Money value={active ? inv.balanceDue : 0} className={cn(inv.displayStatus === "OVERDUE" && "text-red-700")} />}
          sub={inv.balanceDue < -0.005 && active ? "Refund due to customer" : undefined}
        />
        <StatCard
          label="Due Date"
          value={<span className={cn("text-base", inv.displayStatus === "OVERDUE" && "text-red-700")}>{formatDate(inv.dueDate)}</span>}
          sub={label(inv.displayStatus)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-lg border bg-card p-4 sm:p-5">
            <DetailList
              className="lg:grid-cols-3"
              items={[
                { label: "Buyer", value: <Link href={`/customers/${inv.customerId}`} className="hover:underline">{inv.order.customerName}</Link> },
                { label: "Mobile", value: inv.order.customerPhone },
                { label: "GSTIN", value: inv.order.customerGstin },
                { label: "Billing Address", value: inv.order.billingAddress },
                { label: "Place of Supply", value: `${inv.order.placeOfSupply} (${inv.order.placeOfSupplyCode}) · ${inv.order.isInterState ? "IGST" : "CGST + SGST"}` },
                { label: "Salesperson", value: inv.order.salesperson?.name },
                { label: "Payment Terms", value: inv.order.paymentTermsDays ? `${inv.order.paymentTermsDays} days` : "Due on invoice" },
                { label: "Issued by", value: `${inv.createdBy?.name ?? "—"} · ${formatDateTime(inv.createdAt)}` },
                { label: "Notes", value: inv.order.notes },
              ]}
            />
          </section>

          <ItemsTable items={inv.order.items} showCost={can("products.viewCost")} />

          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Payments</h2>
            </div>
            {inv.payments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No payments yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="h-9 px-4 text-left font-medium">No.</th>
                      <th className="px-3 text-left font-medium">Date</th>
                      <th className="px-3 text-left font-medium">Type</th>
                      <th className="px-3 text-left font-medium">Mode</th>
                      <th className="px-3 text-left font-medium">Reference</th>
                      <th className="px-3 text-left font-medium">By</th>
                      <th className="px-3 text-right font-medium">Amount</th>
                      {can("payments.edit") && <th className="w-20 px-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {inv.payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-4 py-2 whitespace-nowrap">{p.paymentNo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                        <td className="px-3 py-2">
                          <span className={p.type === "REFUND" ? "text-red-700" : undefined}>{label(p.type)}</span>
                        </td>
                        <td className="px-3 py-2">{label(p.mode)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{[p.reference, p.notes].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-3 py-2">{p.receivedBy?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          <Money value={p.type === "REFUND" ? -p.amount : p.amount} />
                        </td>
                        {can("payments.edit") && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button variant="ghost" size="icon-sm" onClick={() => setPayDialog({ type: p.type, payment: p })} aria-label="Edit Payment">
                              <Pencil />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => deletePayment(p)} aria-label="Delete Payment">
                              <Trash2 />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Credit Notes</h2>
            </div>
            {inv.creditNotes.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No credit notes</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="h-9 px-4 text-left font-medium">No.</th>
                      <th className="px-3 text-left font-medium">Date</th>
                      <th className="px-3 text-left font-medium">Reason</th>
                      <th className="px-3 text-left font-medium">Status</th>
                      <th className="px-3 text-right font-medium">Taxable</th>
                      <th className="px-3 text-right font-medium">Total</th>
                      <th className="w-24 px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {inv.creditNotes.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Link href={`/sales/credit-notes/${c.id}`} className="font-medium hover:underline">
                            {c.creditNoteNo}
                          </Link>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(c.date)}</td>
                        <td className="px-3 py-2">{c.reason}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Money value={c.taxableTotal} />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          <Money value={c.total} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon-sm" onClick={() => window.open(`/print/credit-notes/${c.id}`, "_blank", "noopener")} aria-label="Print Credit Note">
                            <Printer />
                          </Button>
                          {c.status === "ACTIVE" && can("creditNotes.manage") && (
                            <Button variant="ghost" size="icon-sm" onClick={() => cancelCreditNote(c.id, c.creditNoteNo)} aria-label="Cancel Credit Note">
                              <Ban />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 self-start">
          <div className="rounded-lg border bg-card p-4">
            <TotalsList t={inv.order} />
            <p className="mt-3 text-xs text-muted-foreground">{inv.totalInWords}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Despatch Details</h2>
            <DetailList className="sm:grid-cols-1" items={despatchItems.filter((d) => d.value)} />
            {!despatchItems.some((d) => d.value) && <p className="text-sm text-muted-foreground">None entered</p>}
          </div>
        </aside>
      </div>

      <PaymentDialog
        open={!!payDialog}
        onOpenChange={(o) => !o && setPayDialog(null)}
        type={payDialog?.type}
        payment={payDialog?.payment}
        invoice={{ id: inv.id, invoiceNo: inv.invoiceNo, balanceDue: inv.balanceDue, amountPaid: inv.amountPaid, customerName: inv.order.customerName }}
        onSaved={refresh}
      />
      <CreditNoteDialog open={cnOpen} onOpenChange={setCnOpen} invoice={inv} onSaved={refresh} />
      <DespatchDialog
        open={despatchOpen}
        onOpenChange={setDespatchOpen}
        title="Despatch Details"
        description="Shown in the invoice header boxes. Amounts cannot be changed after issue."
        initial={inv}
        submitText="Save"
        onSubmit={async (form) => {
          try {
            await api.patch(`/api/invoices/${id}`, despatchPayload(form));
            toast.success("Despatch details saved");
            refresh();
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </>
  );
}
