"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { Money, RequirePermission } from "@/components/common/misc";
import { useListState } from "@/hooks/use-list-state";
import { api, type Paged } from "@/lib/api-client";
import { formatAmount, formatDate, label } from "@/lib/format";
import type { CreditNoteRow } from "../types";

export default function CreditNotesPage() {
  return (
    <RequirePermission permission={["creditNotes.manage", "invoices.view"]}>
      <CreditNoteList />
    </RequirePermission>
  );
}

function CreditNoteList() {
  const router = useRouter();
  const list = useListState({ status: "", from: "", to: "" }, { field: "date", dir: "desc" });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["credit-notes", list.params],
    queryFn: () => api.get<Paged<CreditNoteRow>>("/api/credit-notes", list.params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<CreditNoteRow>[] = [
    { key: "creditNoteNo", header: "Credit Note No.", sortable: true, className: "font-medium whitespace-nowrap" },
    { key: "date", header: "Date", sortable: true, cell: (c) => formatDate(c.date), exportValue: (c) => formatDate(c.date) },
    {
      key: "invoice",
      header: "Invoice",
      cell: (c) => (
        <Link href={`/sales/invoices/${c.invoiceId}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap hover:underline">
          {c.invoice?.invoiceNo}
        </Link>
      ),
      exportValue: (c) => c.invoice?.invoiceNo ?? "",
    },
    { key: "customer", header: "Customer", cell: (c) => c.invoice?.order.customerName, exportValue: (c) => c.invoice?.order.customerName ?? "" },
    { key: "reason", header: "Reason", cell: (c) => <span className="line-clamp-2 min-w-40">{c.reason}</span>, exportValue: (c) => c.reason },
    { key: "taxableTotal", header: "Taxable", align: "right", cell: (c) => <Money value={c.taxableTotal} />, exportValue: (c) => c.taxableTotal },
    {
      key: "tax",
      header: "GST",
      align: "right",
      cell: (c) => <Money value={c.cgstTotal + c.sgstTotal + c.igstTotal + c.cessTotal} />,
      exportValue: (c) => c.cgstTotal + c.sgstTotal + c.igstTotal + c.cessTotal,
    },
    { key: "total", header: "Total", align: "right", sortable: true, cell: (c) => <Money value={c.total} className="font-medium" />, exportValue: (c) => c.total },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} />, exportValue: (c) => label(c.status) },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<CreditNoteRow>>("/api/credit-notes", { ...list.params, page: 1, pageSize: "all" });
    const active = all.data.filter((c) => c.status === "ACTIVE");
    return {
      title: "Credit Notes",
      filename: "credit-notes",
      subtitle: [describeRange(list.filters), `${all.total} credit notes (totals exclude cancelled)`],
      columns,
      rows: all.data,
      totals: {
        taxableTotal: formatAmount(active.reduce((s, c) => s + c.taxableTotal, 0)),
        total: formatAmount(active.reduce((s, c) => s + c.total, 0)),
      },
    };
  };

  return (
    <>
      <PageHeader title="Credit notes" description="Financial credits against invoices (no stock movement). Issue them from an invoice.">
        <ExportMenu getTable={exportTable} />
      </PageHeader>
      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Credit note, invoice, customer" />
        <SimpleSelect
          className="h-9 w-36"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          clearLabel="All statuses"
          placeholder="All statuses"
          options={[
            { value: "ACTIVE", label: "Active" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
        <DateRangeFilter value={{ from: list.filters.from, to: list.filters.to }} onChange={(r) => list.setFilters(r)} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(c) => c.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(c) => router.push(`/sales/credit-notes/${c.id}`)}
        emptyText="No credit notes"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
