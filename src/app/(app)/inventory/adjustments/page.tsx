"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange, type DateRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { DetailList, Qty, RequirePermission } from "@/components/common/misc";
import { Can } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, type Paged } from "@/lib/api-client";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ADJUSTMENT_REASONS } from "../constants";
import type { AdjustmentRow } from "../types";

export default function AdjustmentsPage() {
  return (
    <RequirePermission permission="inventory.view">
      <AdjustmentList />
    </RequirePermission>
  );
}

const signed = (r: AdjustmentRow) => `${r.type === "INCREASE" ? "+" : "−"}${formatQty(r.quantity)}`;

function AdjustmentList() {
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [open, setOpen] = useState<AdjustmentRow | null>(null);
  const list = useListState({ type: "", reason: "" }, { field: "date", dir: "desc" });
  const params = { ...list.params, ...range };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["adjustments", params],
    queryFn: () => api.get<Paged<AdjustmentRow>>("/api/inventory/adjustments", params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AdjustmentRow>[] = [
    { key: "date", header: "Date", sortable: true, cell: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
    { key: "adjustmentNo", header: "Adjustment No", cell: (r) => <span className="font-medium whitespace-nowrap">{r.adjustmentNo}</span> },
    {
      key: "product",
      header: "Product",
      cell: (r) => (
        <div className="min-w-40">
          <div>{r.product.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{r.product.sku}</div>
        </div>
      ),
      exportValue: (r) => `${r.product.name} (${r.product.sku})`,
    },
    { key: "existingStock", header: "Before", align: "right", cell: (r) => <Qty value={r.existingStock} /> },
    {
      key: "quantity",
      header: "Change",
      align: "right",
      cell: (r) => <span className={cn("font-medium tabular-nums", r.type === "INCREASE" ? "text-emerald-700" : "text-red-700")}>{signed(r)}</span>,
      exportValue: (r) => (r.type === "INCREASE" ? r.quantity : -r.quantity),
    },
    { key: "newStock", header: "After", align: "right", cell: (r) => <Qty value={r.newStock} /> },
    {
      key: "reason",
      header: "Reason",
      cell: (r) => (
        <div className="max-w-60">
          <div>{r.reason}</div>
          {r.remarks && <div className="truncate text-xs text-muted-foreground" title={r.remarks}>{r.remarks}</div>}
        </div>
      ),
      exportValue: (r) => (r.remarks ? `${r.reason}: ${r.remarks}` : r.reason),
    },
    { key: "approvedBy", header: "Approved by", cell: (r) => r.approvedBy?.name ?? "—", exportValue: (r) => r.approvedBy?.name ?? "" },
    { key: "createdBy", header: "By", cell: (r) => r.createdBy?.name ?? "—", exportValue: (r) => r.createdBy?.name ?? "" },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<AdjustmentRow>>("/api/inventory/adjustments", { ...params, page: 1, pageSize: "all" });
    return { title: "Stock Adjustments", filename: "stock-adjustments", subtitle: [describeRange(range), `${all.total} adjustments`], columns, rows: all.data };
  };

  return (
    <>
      <PageHeader title="Stock Adjustments" description="Corrections to showroom stock, with reason and approval">
        <ExportMenu getTable={exportTable} />
        <Can permission="inventory.adjust">
          <Button asChild>
            <Link href="/inventory/adjustments/new">
              <Plus /> New adjustment
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Product, SKU or adjustment no" />
        <SimpleSelect
          className="h-9 w-36"
          value={list.filters.type}
          onChange={(v) => list.setFilter("type", v)}
          clearLabel="Increase & decrease"
          placeholder="Increase & decrease"
          options={[
            { value: "INCREASE", label: "Increase" },
            { value: "DECREASE", label: "Decrease" },
          ]}
        />
        <SimpleSelect
          className="h-9 w-52"
          value={list.filters.reason}
          onChange={(v) => list.setFilter("reason", v)}
          clearLabel="All reasons"
          placeholder="All reasons"
          options={ADJUSTMENT_REASONS.map((r) => ({ value: r, label: r }))}
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
        onRowClick={setOpen}
        emptyText="No adjustments found"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adjustment {open?.adjustmentNo}</DialogTitle>
          </DialogHeader>
          {open && (
            <DetailList
              items={[
                { label: "Date", value: formatDate(open.date) },
                {
                  label: "Product",
                  value: (
                    <Link href={`/products/${open.product.id}`} className="hover:underline">
                      {open.product.name} ({open.product.sku})
                    </Link>
                  ),
                },
                { label: "Change", value: signed(open) },
                { label: "Stock", value: `${formatQty(open.existingStock)} → ${formatQty(open.newStock)}` },
                { label: "Reason", value: open.reason },
                { label: "Approved by", value: open.approvedBy?.name },
                { label: "Recorded by", value: `${open.createdBy?.name ?? "—"}, ${formatDateTime(open.createdAt)}` },
                { label: "Remarks", value: open.remarks },
              ]}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
