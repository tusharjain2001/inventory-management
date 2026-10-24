"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { Money, RequirePermission } from "@/components/common/misc";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { useMeta } from "@/hooks/use-meta";
import { api, type Paged } from "@/lib/api-client";
import { formatAmount, formatDate, label } from "@/lib/format";
import type { OrderRow } from "../types";

type OrdersResponse = Paged<OrderRow> & { sumGrandTotal: number };

export default function OrdersPage() {
  return (
    <RequirePermission permission="sales.view">
      <OrderList />
    </RequirePermission>
  );
}

function OrderList() {
  const router = useRouter();
  const { can } = useSession();
  const { data: meta } = useMeta();
  const list = useListState({ status: "", salespersonId: "", from: "", to: "" }, { field: "orderDate", dir: "desc" });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["sales-orders", list.params],
    queryFn: () => api.get<OrdersResponse>("/api/sales/orders", list.params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<OrderRow>[] = [
    { key: "orderNo", header: "Order No.", sortable: true, className: "font-medium whitespace-nowrap" },
    { key: "orderDate", header: "Date", sortable: true, cell: (o) => formatDate(o.orderDate), exportValue: (o) => formatDate(o.orderDate) },
    {
      key: "customerName",
      header: "Customer",
      cell: (o) => (
        <div className="min-w-32">
          <div>{o.customerName}</div>
          {o.customerPhone && <div className="text-xs text-muted-foreground">{o.customerPhone}</div>}
        </div>
      ),
    },
    { key: "items", header: "Items", align: "right", cell: (o) => o._count.items, exportValue: (o) => o._count.items },
    {
      key: "grandTotal",
      header: "Total",
      align: "right",
      sortable: true,
      cell: (o) => <Money value={o.grandTotal} className={o.status === "CANCELLED" ? "text-muted-foreground line-through" : undefined} />,
      exportValue: (o) => o.grandTotal,
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => <StatusBadge status={o.status} />,
      exportValue: (o) => label(o.status),
    },
    {
      key: "invoice",
      header: "Invoice",
      cell: (o) =>
        o.invoice ? (
          <Link href={`/sales/invoices/${o.invoice.id}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap hover:underline">
            {o.invoice.invoiceNo}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      exportValue: (o) => o.invoice?.invoiceNo ?? "",
    },
    {
      key: "payment",
      header: "Payment",
      cell: (o) => (o.invoice && o.invoice.status === "ACTIVE" ? <StatusBadge status={o.invoice.paymentStatus} /> : null),
      exportValue: (o) => (o.invoice ? label(o.invoice.paymentStatus) : ""),
    },
    { key: "salesperson", header: "Salesperson", cell: (o) => o.salesperson?.name ?? "—", exportValue: (o) => o.salesperson?.name ?? "" },
  ];

  const exportTable = async () => {
    const all = await api.get<OrdersResponse>("/api/sales/orders", { ...list.params, page: 1, pageSize: "all" });
    return {
      title: "Sales Orders",
      filename: "sales-orders",
      subtitle: [describeRange(list.filters), list.filters.status ? `Status: ${label(list.filters.status)}` : "All Statuses", `${all.total} orders`],
      columns,
      rows: all.data,
      totals: { grandTotal: formatAmount(all.sumGrandTotal) },
    };
  };

  return (
    <>
      <PageHeader title="Sales Orders" description="Drafts, confirmed and invoiced sales">
        <ExportMenu getTable={exportTable} />
        <Can permission="sales.create">
          <Button asChild>
            <Link href="/sales/orders/new">
              <Plus /> New Sale
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Order no., customer, mobile" />
        <SimpleSelect
          className="h-9 w-36"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          clearLabel="All Statuses"
          placeholder="All Statuses"
          options={["DRAFT", "CONFIRMED", "INVOICED", "CANCELLED"].map((s) => ({ value: s, label: label(s) }))}
        />
        {can("sales.viewAll") && (
          <SimpleSelect
            className="h-9 w-40"
            value={list.filters.salespersonId}
            onChange={(v) => list.setFilter("salespersonId", v)}
            clearLabel="All Salespeople"
            placeholder="All Salespeople"
            options={(meta?.users ?? []).map((u) => ({ value: String(u.id), label: u.name }))}
          />
        )}
        <DateRangeFilter value={{ from: list.filters.from, to: list.filters.to }} onChange={(r) => list.setFilters(r)} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(o) => o.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(o) => router.push(`/sales/orders/${o.id}`)}
        emptyText="No orders match these filters"
      />
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            Total (excl. cancelled): <Money value={data.sumGrandTotal} className="font-medium text-foreground" />
          </div>
          <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        </div>
      )}
    </>
  );
}
