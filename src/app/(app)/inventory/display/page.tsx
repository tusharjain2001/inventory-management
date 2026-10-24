"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange, type DateRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { Qty, RequirePermission } from "@/components/common/misc";
import { Can } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, type Paged } from "@/lib/api-client";
import { formatDate, label } from "@/lib/format";
import { istDateString, todayIST } from "@/lib/dates";
import type { DisplayRow } from "../types";

export default function DisplayListPage() {
  return (
    <RequirePermission permission="inventory.view">
      <DisplayList />
    </RequirePermission>
  );
}

const overdue = (r: DisplayRow) => r.status !== "CLOSED" && !!r.expectedReturnDate && istDateString(r.expectedReturnDate) < todayIST();

function DisplayList() {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const list = useListState({ status: "OPEN" }, { field: "date", dir: "desc" });
  const params = { ...list.params, ...range };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["displays", params],
    queryFn: () => api.get<Paged<DisplayRow>>("/api/inventory/display", params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<DisplayRow>[] = [
    { key: "date", header: "Date", sortable: true, cell: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
    { key: "displayNo", header: "Display No", cell: (r) => <span className="font-medium whitespace-nowrap">{r.displayNo}</span> },
    {
      key: "locationName",
      header: "Location",
      cell: (r) => (
        <div className="min-w-40">
          <div>{r.locationName}</div>
          {(r.contactPerson || r.contactPhone) && (
            <div className="text-xs text-muted-foreground">{[r.contactPerson, r.contactPhone].filter(Boolean).join(" · ")}</div>
          )}
        </div>
      ),
      exportValue: (r) => r.locationName,
    },
    { key: "customer", header: "Customer", cell: (r) => r.customer?.name ?? "—", exportValue: (r) => r.customer?.name ?? "" },
    { key: "totalQty", header: "Sent", align: "right", cell: (r) => <Qty value={r.totalQty} /> },
    { key: "returnedQty", header: "Returned", align: "right", cell: (r) => <Qty value={r.returnedQty} /> },
    { key: "soldQty", header: "Sold", align: "right", cell: (r) => <Qty value={r.soldQty} /> },
    {
      key: "outstandingQty",
      header: "Still Out",
      align: "right",
      cell: (r) => <Qty value={r.outstandingQty} className={r.outstandingQty > 0 ? "font-semibold text-violet-700" : "text-muted-foreground"} />,
    },
    {
      key: "expectedReturnDate",
      header: "Expected Back",
      sortable: true,
      cell: (r) =>
        r.expectedReturnDate ? (
          <span className={overdue(r) ? "font-medium text-red-700" : undefined}>
            {formatDate(r.expectedReturnDate)}
            {overdue(r) && <span className="block text-[11px]">Overdue</span>}
          </span>
        ) : (
          "—"
        ),
      exportValue: (r) => (r.expectedReturnDate ? formatDate(r.expectedReturnDate) : ""),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, exportValue: (r) => label(r.status) },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<DisplayRow>>("/api/inventory/display", { ...params, page: 1, pageSize: "all" });
    return {
      title: "Potential Sales (Display)",
      filename: "display-stock",
      subtitle: [describeRange(range), list.filters.status === "OPEN" ? "Open only" : list.filters.status ? label(list.filters.status) : "All", `${all.total} records`],
      columns,
      rows: all.data,
    };
  };

  return (
    <>
      <PageHeader title="Potential Sales (Display)" description="Stock taken out to show at a client's location">
        <ExportMenu getTable={exportTable} />
        <Can permission="inventory.display">
          <Button asChild>
            <Link href="/inventory/display/new">
              <Plus /> Send for Display
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Display no, location, customer" />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          clearLabel="All Statuses"
          placeholder="All Statuses"
          options={[
            { value: "OPEN", label: "Open (Not Closed)" },
            { value: "OUT", label: label("OUT") },
            { value: "PARTIAL", label: label("PARTIAL") },
            { value: "CLOSED", label: label("CLOSED") },
          ]}
        />
        <DateRangeFilter
          value={range}
          onChange={(r) => {
            setRange(r);
            list.setPage(1);
          }}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(r) => r.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(r) => router.push(`/inventory/display/${r.id}`)}
        emptyText="No display records found"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
