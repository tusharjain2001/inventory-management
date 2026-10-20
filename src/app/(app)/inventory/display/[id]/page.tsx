"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, ShoppingCart, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Field } from "@/components/common/form-field";
import { StatusBadge } from "@/components/common/status-badge";
import { DetailList, ErrorBlock, LoadingBlock, Money, Qty, RequirePermission, StatCard } from "@/components/common/misc";
import { Can, useSession } from "@/components/session-provider";
import { api, errorMessage } from "@/lib/api-client";
import { istDateString, todayIST } from "@/lib/dates";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import { txnLabel } from "../../constants";
import type { DisplayDetail } from "../../types";

export default function DisplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="inventory.view">
      <DisplayView id={Number(id)} />
    </RequirePermission>
  );
}

type Item = DisplayDetail["items"][number];

function DisplayView({ id }: { id: number }) {
  const { can } = useSession();
  const [returnOpen, setReturnOpen] = useState(false);
  const { data: d, isLoading, error } = useQuery({
    queryKey: ["display", id],
    queryFn: () => api.get<DisplayDetail>(`/api/inventory/display/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !d) return <ErrorBlock error={error} />;

  const sum = (f: (i: Item) => number) => d.items.reduce((s, i) => s + f(i), 0);
  const outstanding = sum((i) => i.outstandingQty);
  const isOverdue = d.status !== "CLOSED" && !!d.expectedReturnDate && istDateString(d.expectedReturnDate) < todayIST();

  const columns: Column<Item>[] = [
    {
      key: "product",
      header: "Product",
      cell: (i) => (
        <Link href={`/products/${i.productId}`} className="hover:underline">
          <div className="font-medium">{i.product.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{i.product.sku}</div>
        </Link>
      ),
    },
    { key: "sellingPrice", header: "Price", align: "right", cell: (i) => <Money value={i.product.sellingPrice} /> },
    { key: "quantity", header: "Sent", align: "right", cell: (i) => <Qty value={i.quantity} /> },
    { key: "returnedQty", header: "Returned", align: "right", cell: (i) => <Qty value={i.returnedQty} /> },
    { key: "soldQty", header: "Sold", align: "right", cell: (i) => <Qty value={i.soldQty} /> },
    {
      key: "outstandingQty",
      header: "Still out",
      align: "right",
      cell: (i) => <Qty value={i.outstandingQty} className={i.outstandingQty > 0 ? "font-semibold text-violet-700" : "text-muted-foreground"} />,
    },
  ];

  return (
    <>
      <PageHeader
        title={d.displayNo}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={d.status} />
            <span>{d.locationName}</span>
          </span>
        }
        back={{ href: "/inventory/display", label: "Potential Sales" }}
      >
        <Button variant="outline" onClick={() => window.open(`/print/display/${d.id}`, "_blank", "noopener")}>
          <Printer /> Print challan
        </Button>
        {outstanding > 0 && (
          <>
            <Can permission="sales.create">
              <Button variant="outline" asChild>
                <Link href={`/sales/orders/new?displayId=${d.id}`}>
                  <ShoppingCart /> Convert to sale
                </Link>
              </Button>
            </Can>
            <Can permission="inventory.display">
              <Button onClick={() => setReturnOpen(true)}>
                <Undo2 /> Record return
              </Button>
            </Can>
          </>
        )}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sent" value={formatQty(sum((i) => i.quantity))} sub={`${d.items.length} product(s)`} />
        <StatCard label="Returned" value={formatQty(sum((i) => i.returnedQty))} />
        <StatCard label="Sold" value={formatQty(sum((i) => i.soldQty))} sub={d.orders.length ? `${d.orders.length} order(s)` : undefined} />
        <StatCard
          label="Still out"
          value={<span className={outstanding > 0 ? "text-violet-700" : undefined}>{formatQty(outstanding)}</span>}
          sub={isOverdue ? <span className="text-red-700">Past expected return date</span> : undefined}
        />
      </div>

      <div className="mb-5 rounded-lg border bg-card p-4">
        <DetailList
          className="lg:grid-cols-3"
          items={[
            { label: "Date sent", value: formatDate(d.date) },
            { label: "Customer", value: d.customer ? `${d.customer.name}${d.customer.mobile ? ` · ${d.customer.mobile}` : ""}` : null },
            {
              label: "Expected return",
              value: d.expectedReturnDate ? <span className={isOverdue ? "font-medium text-red-700" : undefined}>{formatDate(d.expectedReturnDate)}</span> : null,
            },
            { label: "Location", value: d.locationName },
            { label: "Address", value: d.address },
            { label: "Contact", value: [d.contactPerson, d.contactPhone].filter(Boolean).join(" · ") },
            { label: "Recorded by", value: `${d.createdBy?.name ?? "—"}, ${formatDateTime(d.createdAt)}` },
            { label: "Remarks", value: d.remarks },
          ]}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold">Items</h2>
      <DataTable columns={columns} rows={d.items} rowKey={(i) => i.id} />

      {d.orders.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold">Sales orders from this display</h2>
          <div className="divide-y rounded-lg border bg-card text-sm">
            {d.orders.map((o) => (
              <Link key={o.id} href={`/sales/orders/${o.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/50">
                <span className="font-medium">{o.orderNo}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">{formatDate(o.orderDate)}</span>
                  {can("sales.view") && <Money value={o.grandTotal} />}
                  <StatusBadge status={o.status} />
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {d.movements.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold">History</h2>
          <ul className="space-y-1.5 text-sm">
            {d.movements.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground tabular-nums">{formatDateTime(m.txnDate)}</span>
                <span>
                  {txnLabel(m.type)}: {m.product.name} × {formatQty(m.quantity)}
                </span>
                {m.createdBy && <span className="text-muted-foreground">by {m.createdBy.name}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {returnOpen && <ReturnDialog display={d} onClose={() => setReturnOpen(false)} />}
    </>
  );
}

function ReturnDialog({ display, onClose }: { display: DisplayDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const open = display.items.filter((i) => i.outstandingQty > 0);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [date, setDate] = useState(todayIST());
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const entered = open.map((i) => ({ item: i, quantity: Number(qty[i.id]) || 0 })).filter((r) => r.quantity > 0);
  const invalid = entered.some((r) => r.quantity > r.item.outstandingQty);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post<{ status: string }>(`/api/inventory/display/${display.id}/return`, {
        date,
        remarks,
        items: entered.map((r) => ({ itemId: r.item.id, quantity: r.quantity })),
      });
      toast.success(res.status === "CLOSED" ? "Return recorded. Display closed." : "Return recorded");
      for (const k of ["display", "displays", "products", "product", "inventory-summary", "inventory-ledger"]) qc.invalidateQueries({ queryKey: [k] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record return</DialogTitle>
          <DialogDescription>Enter the quantity that came back to the showroom from {display.locationName}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {open.map((i) => {
            const over = (Number(qty[i.id]) || 0) > i.outstandingQty;
            return (
              <div key={i.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{i.product.name}</div>
                  <div className={over ? "text-xs text-red-700" : "text-xs text-muted-foreground"}>
                    {i.product.sku} · {formatQty(i.outstandingQty)} still out
                  </div>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  max={i.outstandingQty}
                  value={qty[i.id] ?? ""}
                  placeholder="0"
                  onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                  className="h-9 w-24 text-right"
                  aria-label={`Quantity returned for ${i.product.name}`}
                  aria-invalid={over || undefined}
                />
              </div>
            );
          })}
          <Button
            type="button"
            variant="link"
            className="h-auto px-0"
            onClick={() => setQty(Object.fromEntries(open.map((i) => [i.id, String(i.outstandingQty)])))}
          >
            Everything came back
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Return date">
            <Input type="date" value={date} min={istDateString(display.date)} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} placeholder="e.g. Client chose a different finish" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !entered.length || invalid}>
            {busy ? "Saving…" : "Save return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
