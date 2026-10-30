"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { DateRangeFilter, FilterBar } from "@/components/common/filters";
import { Field } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { useConfirm } from "@/components/common/confirm";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { useMeta } from "@/hooks/use-meta";
import { api, errorMessage } from "@/lib/api-client";
import { todayIST } from "@/lib/dates";
import { formatDate, formatINR, label } from "@/lib/format";
import { PAYMENT_MODE_OPTIONS } from "@/app/(app)/sales/types";
import {
  amt,
  apiParams,
  dateCol,
  HelpText,
  moneyCol,
  qty,
  qtyCol,
  ReportHeader,
  StatGrid,
  subtitle,
  SupplierFilter,
  supplierName,
  Toggle,
  TotalsRow,
  useReport,
  useSorted,
  useUrlFilters,
} from "../_components/report-kit";

type Row = {
  id: number;
  saleDate: string;
  orderId: number;
  orderNo: string;
  invoiceId: number | null;
  invoiceNo: string;
  orderStatus: string;
  customer: string;
  supplierId: number;
  supplier: string;
  productId: number;
  product: string;
  sku: string;
  quantity: number;
  saleValue: number;
  unitCost: number;
  payable: number;
  settlement: { id: number; date: string; mode: string; reference: string | null } | null;
};
type SupplierRow = { supplierId: number; supplier: string; lines: number; quantity: number; saleValue: number; payable: number; paid: number; unpaid: number };
type Data = {
  rows: Row[];
  suppliers: SupplierRow[];
  totals: { lines: number; suppliers: number; quantity: number; saleValue: number; payable: number; paid: number; unpaid: number };
  meta: { period: string };
};
type Settlement = {
  id: number;
  date: string;
  amount: number;
  mode: string;
  reference: string | null;
  remarks: string | null;
  supplier: { id: number; name: string };
  createdBy: { name: string } | null;
  _count: { items: number };
};

type Status = "UNPAID" | "PAID" | "ALL";
const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "UNPAID", label: "Not Paid Yet" },
  { value: "PAID", label: "Paid" },
  { value: "ALL", label: "All" },
];

export default function ConsignmentReportPage() {
  return (
    <RequirePermission permission="reports.purchase">
      <Suspense>
        <ConsignmentReport />
      </Suspense>
    </RequirePermission>
  );
}

function ConsignmentReport() {
  const { data: meta } = useMeta();
  const { can } = useSession();
  const canSettle = can("consignment.settle");
  const [f, setF] = useUrlFilters({ from: "", to: "", supplierId: "", status: "UNPAID" });
  const [sort, setSort] = useState<SortState>(undefined);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const status = f.status as Status;
  const params = { ...apiParams(f, ["status"]), ...(status === "ALL" ? {} : { status }) };
  const { data, isFetching } = useReport<Data>("consignment", params);
  const rows = useSorted(data?.rows, sort);
  const t = data?.totals;

  // Only unpaid lines of one supplier can be paid together.
  const payable = (r: Row) => !r.settlement && r.orderStatus !== "CANCELLED";
  const selectable = canSettle && !!f.supplierId;
  const selectableRows = (rows ?? []).filter(payable);
  const chosen = selectableRows.filter((r) => selected.has(r.id));
  const chosenTotal = chosen.reduce((s, r) => s + r.payable, 0);
  const allChosen = selectableRows.length > 0 && chosen.length === selectableRows.length;

  const setFilters = (patch: Partial<typeof f>) => {
    setSelected(new Set());
    setF(patch);
  };
  const toggle = (id: number, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const columns: Column<Row>[] = [
    ...(selectable
      ? [
          {
            key: "select",
            header: (
              <Checkbox
                checked={allChosen}
                onCheckedChange={(v) => setSelected(v ? new Set(selectableRows.map((r) => r.id)) : new Set())}
                aria-label="Select all unpaid"
              />
            ),
            noExport: true,
            className: "w-8",
            cell: (r: Row) =>
              payable(r) ? <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, !!v)} aria-label={`Select ${r.sku}`} /> : null,
          } as Column<Row>,
        ]
      : []),
    dateCol("saleDate", "Sale Date"),
    {
      key: "invoiceNo",
      header: "Invoice No",
      sortable: true,
      cell: (r) =>
        r.invoiceId ? (
          <Link href={`/sales/invoices/${r.invoiceId}`} className="font-medium whitespace-nowrap hover:underline">
            {r.invoiceNo}
          </Link>
        ) : (
          <Link href={`/sales/orders/${r.orderId}`} className="whitespace-nowrap hover:underline">
            {r.orderNo}
          </Link>
        ),
      exportValue: (r) => r.invoiceNo || r.orderNo,
    },
    { key: "customer", header: "Customer", sortable: true },
    { key: "supplier", header: "Supplier", sortable: true },
    { key: "product", header: "Product", sortable: true, className: "min-w-36" },
    { key: "sku", header: "SKU", sortable: true, className: "font-mono text-xs whitespace-nowrap" },
    qtyCol("quantity", "Qty"),
    moneyCol<Row>("saleValue", "Sale Value"),
    moneyCol<Row>("unitCost", "Supplier Price"),
    moneyCol<Row>("payable", "Owed to Supplier", { className: "tabular-nums whitespace-nowrap font-medium" }),
    {
      key: "settlement",
      header: "Status",
      cell: (r) =>
        r.settlement ? (
          <span className="whitespace-nowrap text-emerald-700">
            Paid {formatDate(r.settlement.date)}
            {r.orderStatus === "CANCELLED" && <span className="block text-xs text-red-700">Sale cancelled</span>}
          </span>
        ) : (
          <span className="whitespace-nowrap text-amber-700">Not paid</span>
        ),
      exportValue: (r) => (r.settlement ? `Paid ${formatDate(r.settlement.date)} (${label(r.settlement.mode)}${r.settlement.reference ? `, ${r.settlement.reference}` : ""})` : "Not paid"),
    },
  ];

  const supplierColumns: Column<SupplierRow>[] = [
    { key: "supplier", header: "Supplier", className: "font-medium" },
    qtyCol("quantity", "Pieces Sold", { sortable: false }),
    moneyCol<SupplierRow>("saleValue", "Sale Value", { sortable: false }),
    moneyCol<SupplierRow>("paid", "Paid", { sortable: false }),
    moneyCol<SupplierRow>("unpaid", "Still to Pay", { sortable: false, className: "tabular-nums whitespace-nowrap font-semibold" }),
    ...(canSettle
      ? [
          {
            key: "action",
            header: "",
            noExport: true,
            align: "right",
            cell: (s: SupplierRow) =>
              s.unpaid > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilters({ supplierId: String(s.supplierId), status: "UNPAID" });
                  }}
                >
                  Select to Pay
                </Button>
              ) : null,
          } as Column<SupplierRow>,
        ]
      : []),
  ];

  const totalValues: Record<string, string> = t
    ? { quantity: qty(t.quantity), saleValue: amt(t.saleValue), payable: amt(t.payable) }
    : {};

  return (
    <>
      <ReportHeader
        title="Consignment Report"
        description="Consignment goods that have sold, and what you owe each supplier"
        getTable={() => ({
          title: "Consignment Report",
          filename: "consignment-report",
          subtitle: subtitle(f, [
            f.supplierId && `Supplier: ${supplierName(meta, f.supplierId) ?? f.supplierId}`,
            `Status: ${STATUS_OPTIONS.find((o) => o.value === status)?.label}`,
          ]),
          columns,
          rows: rows ?? [],
          totals: totalValues,
        })}
      />

      <FilterBar>
        <DateRangeFilter value={f} onChange={(r) => setFilters(r)} />
        <SupplierFilter value={f.supplierId} onChange={(supplierId) => setFilters({ supplierId })} />
        <Toggle value={status} onChange={(v) => setFilters({ status: v })} options={STATUS_OPTIONS} />
      </FilterBar>

      <StatGrid>
        <StatCard
          label="Still to Pay Suppliers"
          value={<span className={t?.unpaid ? "text-amber-700" : undefined}>{formatINR(t?.unpaid)}</span>}
          sub="For consignment goods sold"
          loading={!data}
        />
        <StatCard label="Paid to Suppliers" value={formatINR(t?.paid)} loading={!data} />
        <StatCard label="Pieces Sold" value={qty(t?.quantity)} sub={`${t?.suppliers ?? 0} supplier(s)`} loading={!data} />
        <StatCard label="Sale Value" value={formatINR(t?.saleValue)} sub="Before GST" loading={!data} />
      </StatGrid>

      <HelpText>
        A product counts as consignment when its Stock Type is &quot;Consignment&quot;. Each sale is recorded against its supplier, and the amount owed
        is the quantity × the supplier price. Sales that were cancelled are not owed.
        {canSettle && " To pay a supplier, choose the supplier, tick the items being paid for and click Record Supplier Payment."}
      </HelpText>

      {!f.supplierId && (data?.suppliers.length ?? 0) > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold">By Supplier</h2>
          <DataTable
            className="mb-5"
            columns={supplierColumns}
            rows={data?.suppliers}
            rowKey={(s) => s.supplierId}
            onRowClick={(s) => setFilters({ supplierId: String(s.supplierId) })}
            dense
          />
        </>
      )}

      {selectable && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="flex-1">
            {chosen.length ? (
              <>
                {chosen.length} item{chosen.length === 1 ? "" : "s"} selected · <b>{formatINR(chosenTotal)}</b>
              </>
            ) : (
              "Tick the items you are paying the supplier for."
            )}
          </span>
          <Button size="sm" disabled={!chosen.length} onClick={() => setPayOpen(true)}>
            <HandCoins /> Record Supplier Payment
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={isFetching}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        dense
        emptyText={status === "UNPAID" ? "Nothing owed to consignment suppliers" : "No consignment sales match these filters"}
        footer={t && rows?.length ? <TotalsRow columns={columns} values={totalValues} /> : undefined}
      />

      <SettlementHistory supplierId={f.supplierId} canSettle={canSettle} />

      {payOpen && chosen.length > 0 && (
        <PayDialog
          supplierId={Number(f.supplierId)}
          supplierName={chosen[0].supplier}
          items={chosen}
          total={chosenTotal}
          onClose={(paid) => {
            setPayOpen(false);
            if (paid) setSelected(new Set());
          }}
        />
      )}
    </>
  );
}

function PayDialog({
  supplierId,
  supplierName,
  items,
  total,
  onClose,
}: {
  supplierId: number;
  supplierName: string;
  items: Row[];
  total: number;
  onClose: (paid: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ date: todayIST(), mode: "BANK_TRANSFER", reference: "", remarks: "" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.post("/api/consignment/settlements", { supplierId, itemIds: items.map((i) => i.id), ...form });
      toast.success(`Payment of ${formatINR(total)} to ${supplierName} recorded`);
      qc.invalidateQueries({ queryKey: ["report", "consignment"] });
      qc.invalidateQueries({ queryKey: ["consignment-settlements"] });
      onClose(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Supplier Payment</DialogTitle>
          <DialogDescription>
            Paying {supplierName} <b>{formatINR(total)}</b> for {items.length} consignment item{items.length === 1 ? "" : "s"} sold.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment Date">
            <Input type="date" value={form.date} max={todayIST()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Mode">
            <SimpleSelect value={form.mode} onChange={(mode) => setForm({ ...form, mode })} options={PAYMENT_MODE_OPTIONS} />
          </Field>
          <Field label="Reference" className="sm:col-span-2">
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e.g. UTR / cheque no." maxLength={100} />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} maxLength={1000} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettlementHistory({ supplierId, canSettle }: { supplierId: string; canSettle: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data } = useQuery({
    queryKey: ["consignment-settlements", supplierId],
    queryFn: () => api.get<{ data: Settlement[] }>("/api/consignment/settlements", { supplierId: supplierId || undefined }),
  });

  async function remove(s: Settlement) {
    const ok = await confirm({
      title: `Remove payment of ${formatINR(s.amount)} to ${s.supplier.name}?`,
      description: "Use this only for a payment entered by mistake. Its items will show as not paid again.",
      confirmText: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/consignment/settlements/${s.id}`);
      toast.success("Payment removed");
      qc.invalidateQueries({ queryKey: ["report", "consignment"] });
      qc.invalidateQueries({ queryKey: ["consignment-settlements"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const rows = data?.data ?? [];
  if (!rows.length) return null;
  return (
    <>
      <h2 className="mt-6 mb-2 text-sm font-semibold">Payments to Suppliers</h2>
      <div className="divide-y rounded-lg border bg-card text-sm">
        {rows.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
            <span className="text-muted-foreground tabular-nums">{formatDate(s.date)}</span>
            <span className="font-medium">{s.supplier.name}</span>
            <span className="font-semibold tabular-nums">{formatINR(s.amount)}</span>
            <span className="text-muted-foreground">
              {label(s.mode)}
              {s.reference ? ` · ${s.reference}` : ""} · {s._count.items} item{s._count.items === 1 ? "" : "s"}
              {s.createdBy ? ` · by ${s.createdBy.name}` : ""}
            </span>
            {s.remarks && <span className="text-muted-foreground italic">{s.remarks}</span>}
            {canSettle && (
              <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => remove(s)} aria-label="Remove payment">
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
