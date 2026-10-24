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
import { Money, Qty, RequirePermission } from "@/components/common/misc";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { useMeta } from "@/hooks/use-meta";
import { api, type Paged } from "@/lib/api-client";
import { formatAmount, formatDate, label } from "@/lib/format";
import { STOCK_IN_SOURCES } from "../constants";
import type { StockInRow } from "../types";

export default function StockInListPage() {
  return (
    <RequirePermission permission={["inventory.stockIn", "purchases.view"]}>
      <StockInList />
    </RequirePermission>
  );
}

function StockInList() {
  const router = useRouter();
  const { canAny } = useSession();
  const { data: meta } = useMeta();
  const showCost = canAny(["products.viewCost", "purchases.view"]);
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const list = useListState({ source: "", supplierId: "" }, { field: "date", dir: "desc" });
  const params = { ...list.params, ...range };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["stock-ins", params],
    queryFn: () => api.get<Paged<StockInRow>>("/api/inventory/stock-in", params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<StockInRow>[] = [
    { key: "date", header: "Date", sortable: true, cell: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
    { key: "stockInNo", header: "Stock-In No", cell: (r) => <span className="font-medium whitespace-nowrap">{r.stockInNo}</span> },
    {
      key: "source",
      header: "Source",
      cell: (r) => <StatusBadge status={r.source} />,
      exportValue: (r) => label(r.source),
    },
    { key: "supplier", header: "Supplier", cell: (r) => r.supplier?.name ?? "—", exportValue: (r) => r.supplier?.name ?? "" },
    {
      key: "purchaseInvoiceNo",
      header: "Purchase Invoice",
      cell: (r) =>
        r.purchaseInvoiceNo ? (
          <div className="whitespace-nowrap">
            {r.purchaseInvoiceNo}
            {r.purchaseInvoiceDate && <div className="text-xs text-muted-foreground">{formatDate(r.purchaseInvoiceDate)}</div>}
          </div>
        ) : (
          "—"
        ),
      exportValue: (r) => [r.purchaseInvoiceNo, r.purchaseInvoiceDate ? formatDate(r.purchaseInvoiceDate) : ""].filter(Boolean).join(" "),
    },
    { key: "itemCount", header: "Items", align: "right" },
    { key: "totalQty", header: "Qty", align: "right", cell: (r) => <Qty value={r.totalQty} /> },
    ...(showCost
      ? ([
          { key: "taxableTotal", header: "Taxable", align: "right", cell: (r) => <Money value={r.taxableTotal} />, exportValue: (r) => r.taxableTotal ?? 0 },
          { key: "gstTotal", header: "GST", align: "right", cell: (r) => <Money value={r.gstTotal} />, exportValue: (r) => r.gstTotal ?? 0 },
          {
            key: "total",
            header: "Total",
            align: "right",
            sortable: true,
            cell: (r) => <Money value={r.total} className="font-medium" />,
            exportValue: (r) => r.total ?? 0,
          },
        ] as Column<StockInRow>[])
      : []),
    { key: "createdBy", header: "By", cell: (r) => r.createdBy?.name ?? "—", exportValue: (r) => r.createdBy?.name ?? "" },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<StockInRow>>("/api/inventory/stock-in", { ...params, page: 1, pageSize: "all" });
    const sum = (f: (r: StockInRow) => number | undefined) => formatAmount(all.data.reduce((s, r) => s + (f(r) ?? 0), 0));
    return {
      title: "Stock In / Purchases",
      filename: "stock-in",
      subtitle: [describeRange(range), `${all.total} entries`],
      columns,
      rows: all.data,
      totals: showCost ? { taxableTotal: sum((r) => r.taxableTotal), gstTotal: sum((r) => r.gstTotal), total: sum((r) => r.total) } : undefined,
    };
  };

  return (
    <>
      <PageHeader title="Stock In / Purchases" description="Goods received into the showroom. Entries cannot be edited; correct mistakes with an adjustment.">
        <ExportMenu getTable={exportTable} />
        <Can permission="inventory.stockIn">
          <Button asChild>
            <Link href="/inventory/stock-in/new">
              <Plus /> New Stock In
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Stock-in no, invoice no, supplier" />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.source}
          onChange={(v) => list.setFilter("source", v)}
          clearLabel="All Sources"
          placeholder="All Sources"
          options={STOCK_IN_SOURCES.map((s) => ({ value: s, label: label(s) }))}
        />
        <SimpleSelect
          className="h-9 w-48"
          value={list.filters.supplierId}
          onChange={(v) => list.setFilter("supplierId", v)}
          clearLabel="All Suppliers"
          placeholder="All Suppliers"
          options={(meta?.suppliers ?? []).map((s) => ({ value: String(s.id), label: s.name }))}
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
        onRowClick={(r) => router.push(`/inventory/stock-in/${r.id}`)}
        emptyText="No stock-in entries found"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
