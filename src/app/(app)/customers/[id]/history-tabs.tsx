"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { EntityPicker } from "@/components/common/entity-picker";
import { StatusBadge } from "@/components/common/status-badge";
import { Money, Qty } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, type Paged } from "@/lib/api-client";
import { formatDate, formatINR, formatQty, label } from "@/lib/format";
import { cn } from "@/lib/utils";

export type HistoryTab = "invoices" | "payments" | "products" | "display";

type InvoiceRow = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  orderId: number;
  orderNo: string;
  grandTotal: number;
  amountPaid: number;
  creditNoteTotal: number;
  balanceDue: number;
  paymentStatus: string;
  status: string;
  displayStatus: string;
};

type PaymentRow = {
  id: number;
  paymentNo: string;
  type: "RECEIPT" | "REFUND";
  paymentDate: string;
  amount: number;
  mode: string;
  reference: string | null;
  notes: string | null;
  invoiceId: number;
  invoiceNo: string;
  receivedBy: { name: string } | null;
};

type ProductRow = {
  productId: number;
  name: string;
  sku: string;
  totalQty: number;
  totalTaxable: number;
  totalValue: number;
  orders: number;
  lastPurchased: string;
};

type DisplayRow = {
  id: number;
  displayNo: string;
  date: string;
  locationName: string;
  expectedReturnDate: string | null;
  status: string;
  itemCount: number;
  issuedQty: number;
  returnedQty: number;
  soldQty: number;
  onDisplayQty: number;
  products: { id: number; name: string; sku: string; onDisplay: number }[];
};

type HistoryResponse<T> = Paged<T> & { totals?: Record<string, number> };

type PickerProduct = { id: number; name: string; sku: string };

const SEARCH_PLACEHOLDER: Record<HistoryTab, string> = {
  invoices: "Invoice no.",
  payments: "Receipt, invoice no. or reference",
  products: "Invoice or order no.",
  display: "Display no. or location",
};

const linkCls = "font-medium text-primary hover:underline";

/** One history list on the customer profile, with its own filters. */
export function CustomerHistory({ customerId, tab }: { customerId: number; tab: HistoryTab }) {
  const router = useRouter();
  const { canAny } = useSession();
  const list = useListState({ from: "", to: "", productId: "", paymentStatus: "", status: "" });
  const [productLabel, setProductLabel] = useState<string>();
  const canPickProduct = canAny(["products.view", "sales.create", "inventory.view"]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["customer-history", customerId, tab, list.params],
    queryFn: () => api.get<HistoryResponse<unknown>>(`/api/customers/${customerId}/history`, { ...list.params, tab }),
    placeholderData: keepPreviousData,
  });
  const loading = isLoading || isFetching;
  const t = data?.totals;

  const filters = (
    <FilterBar>
      <DateRangeFilter value={{ from: list.filters.from, to: list.filters.to }} onChange={(r) => list.setFilters(r)} />
      <SearchInput value={list.q} onChange={list.setQ} placeholder={SEARCH_PLACEHOLDER[tab]} className="sm:w-56" />
      {canPickProduct && (
        <div className="w-full sm:w-60">
          <EntityPicker<PickerProduct>
            endpoint="/api/products"
            params={{ active: "all" }}
            toOption={(p) => ({ value: p.id, label: p.name, sub: p.sku, raw: p })}
            value={list.filters.productId ? Number(list.filters.productId) : null}
            selectedLabel={productLabel}
            onChange={(o) => {
              setProductLabel(o?.label);
              list.setFilter("productId", o ? String(o.value) : "");
            }}
            placeholder="Any product"
            searchPlaceholder="Search product name or SKU"
          />
        </div>
      )}
      {tab === "invoices" && (
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.paymentStatus}
          onChange={(v) => list.setFilter("paymentStatus", v)}
          clearLabel="Any status"
          placeholder="Any status"
          options={["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE", "REFUNDED", "CANCELLED"].map((v) => ({ value: v, label: label(v) }))}
        />
      )}
      {tab === "display" && (
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          clearLabel="Any status"
          placeholder="Any status"
          options={["OUT", "PARTIAL", "CLOSED"].map((v) => ({ value: v, label: label(v) }))}
        />
      )}
    </FilterBar>
  );

  const pager = data && (
    <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
  );

  const summary = (items: { label: string; value: React.ReactNode; className?: string }[]) =>
    data && data.total > 0 ? (
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {items.map((i) => (
          <span key={i.label}>
            {i.label}: <span className={cn("font-medium text-foreground tabular-nums", i.className)}>{i.value}</span>
          </span>
        ))}
      </div>
    ) : null;

  if (tab === "invoices") {
    const columns: Column<InvoiceRow>[] = [
      {
        key: "invoiceNo",
        header: "Invoice",
        cell: (r) => (
          <Link href={`/sales/invoices/${r.id}`} className={linkCls} onClick={(e) => e.stopPropagation()}>
            {r.invoiceNo}
          </Link>
        ),
      },
      { key: "invoiceDate", header: "Date", cell: (r) => formatDate(r.invoiceDate) },
      { key: "dueDate", header: "Due", cell: (r) => formatDate(r.dueDate) },
      {
        key: "orderNo",
        header: "Order",
        cell: (r) => (
          <Link href={`/sales/orders/${r.orderId}`} className="text-muted-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.orderNo}
          </Link>
        ),
      },
      { key: "grandTotal", header: "Amount", align: "right", cell: (r) => <Money value={r.grandTotal} /> },
      { key: "amountPaid", header: "Paid", align: "right", cell: (r) => <Money value={r.amountPaid} /> },
      {
        key: "creditNoteTotal",
        header: "Credit notes",
        align: "right",
        cell: (r) => (r.creditNoteTotal ? <Money value={r.creditNoteTotal} /> : "—"),
      },
      {
        key: "balanceDue",
        header: "Balance",
        align: "right",
        cell: (r) => <Money value={r.balanceDue} className={cn(r.status === "ACTIVE" && r.balanceDue > 0.005 && "font-medium text-red-700")} />,
      },
      { key: "displayStatus", header: "Status", cell: (r) => <StatusBadge status={r.displayStatus} /> },
    ];
    return (
      <>
        {filters}
        {summary([
          { label: "Invoiced", value: formatINR(t?.grandTotal) },
          { label: "Paid", value: formatINR(t?.amountPaid) },
          { label: "Credit notes", value: formatINR(t?.creditNoteTotal) },
          { label: "Balance due", value: formatINR(t?.balanceDue), className: (t?.balanceDue ?? 0) > 0.005 ? "text-red-700" : undefined },
        ])}
        <DataTable
          columns={columns}
          rows={data?.data as InvoiceRow[] | undefined}
          loading={loading}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/sales/invoices/${r.id}`)}
          emptyText="No invoices"
          dense
        />
        {pager}
      </>
    );
  }

  if (tab === "payments") {
    const columns: Column<PaymentRow>[] = [
      { key: "paymentNo", header: "Receipt", cell: (r) => <span className="font-medium">{r.paymentNo}</span> },
      { key: "paymentDate", header: "Date", cell: (r) => formatDate(r.paymentDate) },
      {
        key: "invoiceNo",
        header: "Invoice",
        cell: (r) => (
          <Link href={`/sales/invoices/${r.invoiceId}`} className={linkCls} onClick={(e) => e.stopPropagation()}>
            {r.invoiceNo}
          </Link>
        ),
      },
      { key: "type", header: "Type", cell: (r) => <StatusBadge status={r.type === "REFUND" ? "REFUNDED" : "PAID"} text={label(r.type)} /> },
      { key: "mode", header: "Mode", cell: (r) => label(r.mode) },
      { key: "reference", header: "Reference", cell: (r) => <span className="text-muted-foreground">{r.reference ?? "—"}</span> },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        cell: (r) => <Money value={r.type === "REFUND" ? -r.amount : r.amount} className={cn(r.type === "REFUND" && "text-red-700")} />,
      },
      { key: "receivedBy", header: "Received by", cell: (r) => r.receivedBy?.name ?? "—" },
    ];
    return (
      <>
        {filters}
        {summary([
          { label: "Received", value: formatINR(t?.received) },
          { label: "Refunded", value: formatINR(t?.refunded) },
          { label: "Net", value: formatINR((t?.received ?? 0) - (t?.refunded ?? 0)) },
        ])}
        <DataTable
          columns={columns}
          rows={data?.data as PaymentRow[] | undefined}
          loading={loading}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/sales/invoices/${r.invoiceId}`)}
          emptyText="No payments"
          dense
        />
        {pager}
      </>
    );
  }

  if (tab === "products") {
    const columns: Column<ProductRow>[] = [
      {
        key: "name",
        header: "Product",
        cell: (r) => (
          <div className="min-w-40">
            <Link href={`/products/${r.productId}`} className={linkCls} onClick={(e) => e.stopPropagation()}>
              {r.name}
            </Link>
            <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
          </div>
        ),
      },
      { key: "orders", header: "Orders", align: "right", cell: (r) => r.orders },
      { key: "totalQty", header: "Quantity", align: "right", cell: (r) => <Qty value={r.totalQty} /> },
      { key: "totalTaxable", header: "Taxable value", align: "right", cell: (r) => <Money value={r.totalTaxable} /> },
      { key: "totalValue", header: "With GST", align: "right", cell: (r) => <Money value={r.totalValue} /> },
      { key: "lastPurchased", header: "Last purchased", cell: (r) => formatDate(r.lastPurchased) },
    ];
    return (
      <>
        {filters}
        {summary([
          { label: "Quantity", value: formatQty(t?.totalQty) },
          { label: "Taxable value", value: formatINR(t?.totalTaxable) },
          { label: "With GST", value: formatINR(t?.totalValue) },
        ])}
        <DataTable
          columns={columns}
          rows={data?.data as ProductRow[] | undefined}
          loading={loading}
          rowKey={(r) => r.productId}
          emptyText="No confirmed or invoiced orders yet"
          dense
        />
        {pager}
        <p className="text-xs text-muted-foreground">From confirmed and invoiced orders.</p>
      </>
    );
  }

  const columns: Column<DisplayRow>[] = [
    {
      key: "displayNo",
      header: "Display",
      cell: (r) => (
        <Link href={`/inventory/display/${r.id}`} className={linkCls} onClick={(e) => e.stopPropagation()}>
          {r.displayNo}
        </Link>
      ),
    },
    { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
    { key: "locationName", header: "Location" },
    {
      key: "products",
      header: "Products",
      cell: (r) => (
        <div className="max-w-72 space-y-0.5 text-xs">
          {r.products.map((p, i) => (
            <div key={`${p.id}-${i}`} className="truncate">
              {p.name}
              {p.onDisplay > 0 && <span className="text-violet-700"> · {formatQty(p.onDisplay)} out</span>}
            </div>
          ))}
        </div>
      ),
    },
    { key: "issuedQty", header: "Sent", align: "right", cell: (r) => <Qty value={r.issuedQty} /> },
    { key: "returnedQty", header: "Returned", align: "right", cell: (r) => <Qty value={r.returnedQty} /> },
    { key: "soldQty", header: "Sold", align: "right", cell: (r) => <Qty value={r.soldQty} /> },
    {
      key: "onDisplayQty",
      header: "On display",
      align: "right",
      cell: (r) => <Qty value={r.onDisplayQty} className={cn(r.onDisplayQty > 0 && "font-medium text-violet-700")} />,
    },
    { key: "expectedReturnDate", header: "Expected back", cell: (r) => (r.expectedReturnDate ? formatDate(r.expectedReturnDate) : "—") },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ];
  const rows = data?.data as DisplayRow[] | undefined;
  const onDisplay = rows?.reduce((s, r) => s + r.onDisplayQty, 0) ?? 0;
  return (
    <>
      {filters}
      {onDisplay > 0 && (
        <div className="mb-2 text-sm text-muted-foreground">
          Currently at their location (this page): <span className="font-medium text-violet-700">{formatQty(onDisplay)} pcs</span>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/inventory/display/${r.id}`)}
        emptyText="No display entries for this customer"
        dense
      />
      {pager}
    </>
  );
}
