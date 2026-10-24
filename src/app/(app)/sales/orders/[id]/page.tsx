"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, FileText, Pencil, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DetailList, ErrorBlock, LoadingBlock, RequirePermission } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { useSession } from "@/components/session-provider";
import { useMeta } from "@/hooks/use-meta";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import { OrderForm } from "../order-form";
import { ItemsTable, TotalsList } from "../../_components/order-summary";
import { DespatchDialog, despatchPayload } from "../../_components/despatch-dialog";
import type { OrderDetail } from "../../types";

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="sales.view">
      <OrderView id={Number(id)} />
    </RequirePermission>
  );
}

function OrderView({ id }: { id: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const { data: meta } = useMeta();
  const [editing, setEditing] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: o, isLoading, error } = useQuery({
    queryKey: ["sales-order", id],
    queryFn: () => api.get<OrderDetail>(`/api/sales/orders/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !o) return <ErrorBlock error={error} />;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sales-order", id] });
    qc.invalidateQueries({ queryKey: ["sales-orders"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  async function confirmOrder() {
    if (!o) return;
    const ok = await confirm({
      title: `Confirm ${o.orderNo}?`,
      description: "The items will be taken out of stock. The order can then be invoiced.",
      confirmText: "Confirm Order",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/api/sales/orders/${id}/confirm`);
      toast.success("Order confirmed");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    if (!o) return;
    const reason = await confirm({
      title: `Cancel ${o.orderNo}${o.invoice ? ` and invoice ${o.invoice.invoiceNo}` : ""}?`,
      description: o.status === "DRAFT" ? "The draft will be marked cancelled." : "Items go back into showroom stock. This cannot be undone.",
      confirmText: "Cancel Order",
      destructive: true,
      reason: { label: "Reason", placeholder: "Why is this being cancelled?" },
    });
    if (!reason) return;
    setBusy(true);
    try {
      await api.post(`/api/sales/orders/${id}/cancel`, { reason });
      toast.success("Order cancelled");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err), { duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  if (editing && meta && o.status === "DRAFT") {
    return (
      <>
        <PageHeader title={`Edit ${o.orderNo}`} back={{ href: `/sales/orders/${id}`, label: o.orderNo }} />
        <OrderForm
          meta={meta}
          order={o}
          onCancel={() => {
            setEditing(false);
            refresh();
          }}
        />
      </>
    );
  }

  const canInvoice = (o.status === "DRAFT" || o.status === "CONFIRMED") && can("sales.create");

  return (
    <>
      <PageHeader
        title={o.orderNo}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            <span>{formatDate(o.orderDate)}</span>
            <span>·</span>
            <span>{o.customerName}</span>
          </span>
        }
        back={{ href: "/sales/orders", label: "Sales Orders" }}
      >
        {o.invoice && (
          <Button asChild variant="outline">
            <Link href={`/sales/invoices/${o.invoice.id}`}>
              <Receipt /> Invoice {o.invoice.invoiceNo}
            </Link>
          </Button>
        )}
        {o.status === "DRAFT" && can("sales.edit") && (
          <Button variant="outline" onClick={() => setEditing(true)} disabled={busy || !meta}>
            <Pencil /> Edit
          </Button>
        )}
        {o.status === "DRAFT" && (can("sales.create") || can("sales.edit")) && (
          <Button variant="outline" onClick={confirmOrder} disabled={busy}>
            <CheckCircle2 /> Confirm
          </Button>
        )}
        {canInvoice && (
          <Button onClick={() => setInvoiceOpen(true)} disabled={busy}>
            <FileText /> Generate Invoice
          </Button>
        )}
        {o.status !== "CANCELLED" && can("sales.cancel") && (
          <Button variant="destructive" onClick={cancelOrder} disabled={busy}>
            <Ban /> Cancel
          </Button>
        )}
      </PageHeader>

      {o.status === "CANCELLED" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          Cancelled {formatDateTime(o.cancelledAt)}
          {o.cancelledBy ? ` by ${o.cancelledBy.name}` : ""}. Reason: {o.cancelReason}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-lg border bg-card p-4 sm:p-5">
            <DetailList
              className="lg:grid-cols-3"
              items={[
                { label: "Customer", value: <Link href={`/customers/${o.customerId}`} className="hover:underline">{o.customerName}</Link> },
                { label: "Mobile", value: o.customerPhone },
                { label: "GSTIN", value: o.customerGstin },
                { label: "Billing Address", value: o.billingAddress },
                { label: "Shipping Address", value: o.shippingAddress },
                { label: "Place of Supply", value: `${o.placeOfSupply} (${o.placeOfSupplyCode}) · ${o.isInterState ? "IGST" : "CGST + SGST"}` },
                { label: "Salesperson", value: o.salesperson?.name },
                { label: "Payment Terms", value: o.paymentTermsDays ? `${o.paymentTermsDays} days` : "Due on invoice" },
                {
                  label: "From Display",
                  value: o.displayIssue ? <Link href={`/inventory/display/${o.displayIssue.id}`} className="hover:underline">{o.displayIssue.displayNo}</Link> : null,
                },
                { label: "Created", value: `${formatDateTime(o.createdAt)}${o.createdBy ? ` by ${o.createdBy.name}` : ""}` },
                { label: "Confirmed", value: o.confirmedAt ? `${formatDateTime(o.confirmedAt)}${o.confirmedBy ? ` by ${o.confirmedBy.name}` : ""}` : null },
                { label: "Notes", value: o.notes },
              ]}
            />
          </section>
          <ItemsTable items={o.items} showCost={can("products.viewCost") && o.status !== "DRAFT"} />
        </div>
        <aside className="self-start rounded-lg border bg-card p-4">
          <TotalsList t={o} />
        </aside>
      </div>

      <DespatchDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        title={`Generate invoice for ${o.orderNo}`}
        description={o.status === "DRAFT" ? "The order will be confirmed (stock out) and invoiced." : "All fields except the date are optional."}
        withDate
        submitText="Generate Invoice"
        onSubmit={async (form) => {
          try {
            const inv = await api.post<{ id: number; invoiceNo: string }>(`/api/sales/orders/${id}/invoice`, {
              ...despatchPayload(form),
              invoiceDate: form.invoiceDate,
            });
            toast.success(`Invoice ${inv.invoiceNo} created`);
            refresh();
            router.push(`/sales/invoices/${inv.id}`);
          } catch (err) {
            toast.error(errorMessage(err), { duration: 8000 });
            throw err;
          }
        }}
      />
    </>
  );
}
