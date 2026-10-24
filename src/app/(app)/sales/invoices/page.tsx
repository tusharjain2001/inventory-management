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
import { Money, RequirePermission, StatCard } from "@/components/common/misc";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { useMeta } from "@/hooks/use-meta";
import { api, type Paged } from "@/lib/api-client";
import { formatAmount, formatDate, label } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InvoiceRow } from "../types";

type InvoicesResponse = Paged<InvoiceRow> & {
  sums: { grandTotal: number | null; amountPaid: number | null; balanceDue: number | null; creditNoteTotal: number | null };
};

export default function InvoicesPage() {
  return (
    <RequirePermission permission={["invoices.view", "payments.view"]}>
      <InvoiceList />
    </RequirePermission>
  );
}

function InvoiceList() {
  const router = useRouter();
  const { can } = useSession();
  const { data: meta } = useMeta();
  const list = useListState({ paymentStatus: "", status: "", salespersonId: "", from: "", to: "" }, { field: "invoiceDate", dir: "desc" });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["invoices", list.params],
    queryFn: () => api.get<InvoicesResponse>("/api/invoices", list.params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<InvoiceRow>[] = [
    { key: "invoiceNo", header: "Invoice No.", sortable: true, className: "font-medium whitespace-nowrap" },
    { key: "invoiceDate", header: "Date", sortable: true, cell: (i) => formatDate(i.invoiceDate), exportValue: (i) => formatDate(i.invoiceDate) },
    {
      key: "customer",
      header: "Customer",
      cell: (i) => (
        <div className="min-w-32">
          <div>{i.order.customerName}</div>
          {i.order.customerPhone && <div className="text-xs text-muted-foreground">{i.order.customerPhone}</div>}
        </div>
      ),
      exportValue: (i) => i.order.customerName,
    },
    { key: "taxable", header: "Taxable", align: "right", cell: (i) => <Money value={i.order.taxableTotal} />, exportValue: (i) => i.order.taxableTotal },
    { key: "tax", header: "GST", align: "right", cell: (i) => <Money value={i.order.taxTotal} />, exportValue: (i) => i.order.taxTotal },
    {
      key: "grandTotal",
      header: "Total",
      align: "right",
      sortable: true,
      cell: (i) => <Money value={i.grandTotal} className={i.status === "CANCELLED" ? "text-muted-foreground line-through" : "font-medium"} />,
      exportValue: (i) => i.grandTotal,
    },
    { key: "amountPaid", header: "Paid", align: "right", cell: (i) => <Money value={i.amountPaid} />, exportValue: (i) => i.amountPaid },
    {
      key: "balanceDue",
      header: "Balance",
      align: "right",
      sortable: true,
      cell: (i) => (i.status === "CANCELLED" ? <span className="text-muted-foreground">—</span> : <Money value={i.balanceDue} className={cn(i.balanceDue > 0 && "font-medium")} />),
      exportValue: (i) => (i.status === "CANCELLED" ? 0 : i.balanceDue),
    },
    {
      key: "dueDate",
      header: "Due",
      sortable: true,
      cell: (i) => <span className={cn(i.displayStatus === "OVERDUE" && "font-medium text-red-700")}>{formatDate(i.dueDate)}</span>,
      exportValue: (i) => formatDate(i.dueDate),
    },
    { key: "displayStatus", header: "Status", cell: (i) => <StatusBadge status={i.displayStatus} />, exportValue: (i) => label(i.displayStatus) },
    {
      key: "salesperson",
      header: "Salesperson",
      cell: (i) => i.order.salesperson?.name ?? "—",
      exportValue: (i) => i.order.salesperson?.name ?? "",
    },
  ];

  const exportTable = async () => {
    const all = await api.get<InvoicesResponse>("/api/invoices", { ...list.params, page: 1, pageSize: "all" });
    const sum = (f: (i: InvoiceRow) => number) => formatAmount(all.data.filter((i) => i.status === "ACTIVE").reduce((s, i) => s + f(i), 0));
    return {
      title: "Invoices",
      filename: "invoices",
      subtitle: [
        describeRange(list.filters),
        list.filters.paymentStatus ? `Payment status: ${label(list.filters.paymentStatus)}` : "All Payment Statuses",
        `${all.total} invoices (totals exclude cancelled)`,
      ],
      columns,
      rows: all.data,
      totals: {
        taxable: sum((i) => i.order.taxableTotal),
        tax: sum((i) => i.order.taxTotal),
        grandTotal: sum((i) => i.grandTotal),
        amountPaid: sum((i) => i.amountPaid),
        balanceDue: sum((i) => i.balanceDue),
      },
    };
  };

  return (
    <>
      <PageHeader title="Invoices" description="GST tax invoices and their payment status">
        <ExportMenu getTable={exportTable} />
        <Can permission="sales.create">
          <Button asChild>
            <Link href="/sales/orders/new">
              <Plus /> New Sale
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invoiced (Filtered)" value={<Money value={data?.sums.grandTotal ?? 0} />} loading={isLoading} />
        <StatCard label="Received" value={<Money value={data?.sums.amountPaid ?? 0} />} loading={isLoading} />
        <StatCard label="Credit Notes" value={<Money value={data?.sums.creditNoteTotal ?? 0} />} loading={isLoading} />
        <StatCard
          label="Balance Due"
          value={<Money value={data?.sums.balanceDue ?? 0} />}
          loading={isLoading}
          onClick={() => list.setFilter("paymentStatus", "OVERDUE")}
          sub="Click to see overdue"
        />
      </div>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Invoice no., customer, mobile" />
        <SimpleSelect
          className="h-9 w-44"
          value={list.filters.paymentStatus}
          onChange={(v) => list.setFilter("paymentStatus", v)}
          clearLabel="Any Payment Status"
          placeholder="Any Payment Status"
          options={["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE", "REFUNDED", "CANCELLED"].map((s) => ({ value: s, label: label(s) }))}
        />
        <SimpleSelect
          className="h-9 w-44"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          clearLabel="Active + Cancelled"
          placeholder="Active + Cancelled"
          options={[
            { value: "ACTIVE", label: "Active Only" },
            { value: "CANCELLED", label: "Cancelled Only" },
          ]}
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
        rowKey={(i) => i.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(i) => router.push(`/sales/invoices/${i.id}`)}
        emptyText="No invoices match these filters"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
