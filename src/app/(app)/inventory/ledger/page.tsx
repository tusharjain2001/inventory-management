"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange, type DateRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { Money, Qty, RequirePermission } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { useMeta } from "@/hooks/use-meta";
import { api, type Paged } from "@/lib/api-client";
import { formatDateTime, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STOCK_TXN_LABELS, STOCK_TXN_TYPES, txnLabel } from "../constants";
import { refHref } from "../product-picker";
import type { LedgerRow } from "../types";

export default function LedgerPage() {
  return (
    <RequirePermission permission="inventory.view">
      <Ledger />
    </RequirePermission>
  );
}

const signedQty = (n: number) => `${n > 0 ? "+" : ""}${formatQty(n)}`;

function Ledger() {
  const { can } = useSession();
  const { data: meta } = useMeta();
  const showCost = can("products.viewCost");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const list = useListState({ type: "", createdById: "" }, { field: "txnDate", dir: "desc" }, 50);
  const params = { ...list.params, ...range };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["inventory-ledger", params],
    queryFn: () => api.get<Paged<LedgerRow>>("/api/inventory/transactions", params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<LedgerRow>[] = [
    {
      key: "txnDate",
      header: "Date",
      sortable: true,
      cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.txnDate)}</span>,
      exportValue: (r) => formatDateTime(r.txnDate),
    },
    {
      key: "product",
      header: "Product",
      cell: (r) => (
        <Link href={`/products/${r.product.id}`} className="block min-w-40 hover:underline">
          {r.product.name}
        </Link>
      ),
      exportValue: (r) => r.product.name,
    },
    { key: "sku", header: "SKU", cell: (r) => <span className="font-mono text-xs">{r.product.sku}</span>, exportValue: (r) => r.product.sku },
    { key: "type", header: "Movement", cell: (r) => <span className="whitespace-nowrap">{txnLabel(r.type)}</span>, exportValue: (r) => txnLabel(r.type) },
    {
      key: "refNo",
      header: "Reference",
      cell: (r) => {
        const href = refHref(r.refType, r.refId);
        if (!r.refNo) return "—";
        return href ? (
          <Link href={href} className="whitespace-nowrap text-primary hover:underline">
            {r.refNo}
          </Link>
        ) : (
          <span className="whitespace-nowrap">{r.refNo}</span>
        );
      },
      exportValue: (r) => r.refNo ?? "",
    },
    {
      key: "stockEffect",
      header: "Showroom",
      align: "right",
      cell: (r) =>
        r.stockEffect ? (
          <span className={cn("font-medium tabular-nums", r.stockEffect > 0 ? "text-emerald-700" : "text-red-700")}>{signedQty(r.stockEffect)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "displayEffect",
      header: "Display",
      align: "right",
      cell: (r) => (r.displayEffect ? <span className="tabular-nums text-violet-700">{signedQty(r.displayEffect)}</span> : <span className="text-muted-foreground">—</span>),
    },
    { key: "balanceAfter", header: "Balance", align: "right", cell: (r) => <Qty value={r.balanceAfter} /> },
    ...(showCost
      ? ([
          { key: "unitCost", header: "Unit Cost", align: "right", cell: (r) => <Money value={r.unitCost} />, exportValue: (r) => r.unitCost ?? 0 },
          { key: "totalCost", header: "Value", align: "right", cell: (r) => <Money value={r.totalCost} />, exportValue: (r) => r.totalCost ?? 0 },
        ] as Column<LedgerRow>[])
      : []),
    { key: "remarks", header: "Remarks", cell: (r) => <div className="max-w-64 truncate text-muted-foreground" title={r.remarks ?? undefined}>{r.remarks}</div>, exportValue: (r) => r.remarks ?? "" },
    { key: "createdBy", header: "By", cell: (r) => r.createdBy?.name ?? "—", exportValue: (r) => r.createdBy?.name ?? "" },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<LedgerRow>>("/api/inventory/transactions", { ...params, page: 1, pageSize: "all" });
    return {
      title: "Stock Ledger",
      filename: "stock-ledger",
      subtitle: [
        describeRange(range),
        list.filters.type ? `Movement: ${txnLabel(list.filters.type)}` : "",
        list.q ? `Search: ${list.q}` : "",
        `${all.total} movements`,
      ].filter(Boolean),
      columns,
      rows: all.data,
    };
  };

  return (
    <>
      <PageHeader title="Stock Ledger" description="Every stock movement across all products">
        <ExportMenu getTable={exportTable} />
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Product, SKU or reference no" />
        <SimpleSelect
          className="h-9 w-48"
          value={list.filters.type}
          onChange={(v) => list.setFilter("type", v)}
          clearLabel="All Movements"
          placeholder="All Movements"
          options={STOCK_TXN_TYPES.map((t) => ({ value: t, label: STOCK_TXN_LABELS[t] }))}
        />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.createdById}
          onChange={(v) => list.setFilter("createdById", v)}
          clearLabel="Any User"
          placeholder="Any User"
          options={(meta?.users ?? []).map((u) => ({ value: String(u.id), label: u.name }))}
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
        emptyText="No stock movements found"
        dense
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
