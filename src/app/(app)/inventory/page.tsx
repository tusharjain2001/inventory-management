"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Clock, MapPin, PackageMinus, PackagePlus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { FilterBar, SearchInput } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { Money, Qty, RequirePermission, StatCard } from "@/components/common/misc";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { useMeta } from "@/hooks/use-meta";
import { api, type Paged } from "@/lib/api-client";
import { formatAmount, formatINR, formatQty, label } from "@/lib/format";
import type { ProductRow } from "@/app/(app)/products/types";
import type { InventorySummary } from "./types";

export default function InventoryPage() {
  return (
    <RequirePermission permission="inventory.view">
      <StockOverview />
    </RequirePermission>
  );
}

function StockOverview() {
  const router = useRouter();
  const { can } = useSession();
  const { data: meta } = useMeta();
  const showCost = can("products.viewCost");
  const list = useListState({ categoryId: "", status: "", active: "true" }, { field: "name", dir: "asc" });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["inventory-summary"],
    queryFn: () => api.get<InventorySummary>("/api/inventory/summary"),
  });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["products", list.params],
    queryFn: () => api.get<Paged<ProductRow>>("/api/products", list.params),
    placeholderData: keepPreviousData,
  });

  // Clicking a stock-status card filters the table below.
  const filterStatus = (status: string) => list.setFilter("status", list.filters.status === status ? "" : status);

  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      cell: (p) => (
        <div className="min-w-40">
          <div className="font-medium">{p.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
        </div>
      ),
      exportValue: (p) => p.name,
    },
    { key: "category", header: "Category", cell: (p) => p.category.name, exportValue: (p) => p.category.name },
    {
      key: "currentStock",
      header: "In showroom",
      align: "right",
      sortable: true,
      cell: (p) => <Qty value={p.currentStock} className="font-medium" />,
    },
    {
      key: "onDisplayStock",
      header: "On display",
      align: "right",
      cell: (p) => (p.onDisplayStock ? <Qty value={p.onDisplayStock} className="text-violet-700" /> : <span className="text-muted-foreground">—</span>),
    },
    { key: "reorderLevel", header: "Reorder at", align: "right", cell: (p) => <Qty value={p.reorderLevel} /> },
    {
      key: "stockStatus",
      header: "Status",
      cell: (p) => <StatusBadge status={p.stockStatus} />,
      exportValue: (p) => label(p.stockStatus),
    },
    ...(showCost
      ? ([
          { key: "avgCost", header: "Avg cost", align: "right", cell: (p) => <Money value={p.avgCost} />, exportValue: (p) => p.avgCost ?? 0 },
          {
            key: "stockValue",
            header: "Stock value",
            align: "right",
            cell: (p) => <Money value={p.stockValue} />,
            exportValue: (p) => p.stockValue ?? 0,
          },
        ] as Column<ProductRow>[])
      : []),
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<ProductRow>>("/api/products", { ...list.params, page: 1, pageSize: "all" });
    const sum = (f: (p: ProductRow) => number) => all.data.reduce((s, p) => s + f(p), 0);
    return {
      title: "Stock Summary",
      filename: "stock-summary",
      subtitle: [
        `${all.total} products`,
        list.filters.status ? `Status: ${label(list.filters.status)}` : "",
      ].filter(Boolean),
      // Exports get SKU as its own column.
      columns: [columns[0], { key: "sku", header: "SKU" } as Column<ProductRow>, ...columns.slice(1)],
      rows: all.data,
      totals: {
        currentStock: formatQty(sum((p) => p.currentStock)),
        onDisplayStock: formatQty(sum((p) => p.onDisplayStock)),
        ...(showCost ? { stockValue: formatAmount(sum((p) => p.stockValue ?? 0)) } : {}),
      },
    };
  };

  const s = summary;
  return (
    <>
      <PageHeader title="Stock Overview" description="Showroom stock, stock out on display and stock alerts">
        <Can permission="inventory.stockIn">
          <Button asChild>
            <Link href="/inventory/stock-in/new">
              <PackagePlus /> Stock in
            </Link>
          </Button>
        </Can>
        <Can permission="inventory.adjust">
          <Button variant="outline" asChild>
            <Link href="/inventory/adjustments/new">
              <SlidersHorizontal /> Adjust
            </Link>
          </Button>
        </Can>
        <Can permission="inventory.damageLoss">
          <Button variant="outline" asChild>
            <Link href="/inventory/losses/new">
              <PackageMinus /> Damaged / Lost
            </Link>
          </Button>
        </Can>
        <Can permission="inventory.display">
          <Button variant="outline" asChild>
            <Link href="/inventory/display/new">
              <MapPin /> Send for display
            </Link>
          </Button>
        </Can>
      </PageHeader>

      {can("inventory.approve") && !!s?.pendingAdjustments && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Clock className="size-4 shrink-0" />
          <span className="flex-1">
            {s.pendingAdjustments} stock adjustment{s.pendingAdjustments === 1 ? " is" : "s are"} waiting for your approval.
          </span>
          <Button size="sm" variant="outline" asChild>
            <Link href="/inventory/adjustments">Review</Link>
          </Button>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Units in showroom" loading={summaryLoading} value={formatQty(s?.unitsInShowroom)} sub={`${s?.activeSkus ?? 0} active products`} />
        <StatCard
          label="Units on display"
          loading={summaryLoading}
          value={formatQty(s?.unitsOnDisplay)}
          sub={`${s?.openDisplays ?? 0} open display records`}
          onClick={() => router.push("/inventory/display")}
        />
        {showCost ? (
          <StatCard label="Stock value (at avg cost)" loading={summaryLoading} value={formatINR(s?.stockValue)} sub="Showroom + display" />
        ) : (
          <StatCard label="In stock" loading={summaryLoading} value={s?.inStock ?? 0} sub="Above reorder level" onClick={() => filterStatus("IN_STOCK")} />
        )}
        <StatCard
          label="Low stock"
          loading={summaryLoading}
          value={<span className={s?.lowStock ? "text-amber-700" : undefined}>{s?.lowStock ?? 0}</span>}
          sub="At or below reorder level"
          onClick={() => filterStatus("LOW_STOCK")}
        />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {showCost && (
          <StatCard label="In stock" loading={summaryLoading} value={s?.inStock ?? 0} sub="Above reorder level" onClick={() => filterStatus("IN_STOCK")} />
        )}
        <StatCard
          label="Out of stock"
          loading={summaryLoading}
          value={<span className={s?.outOfStock ? "text-red-700" : undefined}>{s?.outOfStock ?? 0}</span>}
          sub="Zero in showroom"
          onClick={() => filterStatus("OUT_OF_STOCK")}
        />
        <StatCard
          label="Negative stock"
          loading={summaryLoading}
          value={<span className={s?.negativeStock ? "text-red-700" : undefined}>{s?.negativeStock ?? 0}</span>}
          sub="Needs correction"
          onClick={() => filterStatus("NEGATIVE")}
        />
        <StatCard
          label="Open displays"
          loading={summaryLoading}
          value={s?.openDisplays ?? 0}
          sub="Stock still at clients"
          onClick={() => router.push("/inventory/display")}
        />
      </div>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Search name or SKU" />
        <SimpleSelect
          className="h-9 w-44"
          value={list.filters.categoryId}
          onChange={(v) => list.setFilter("categoryId", v)}
          clearLabel="All categories"
          placeholder="All categories"
          options={(meta?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
        />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          clearLabel="Any stock status"
          placeholder="Any stock status"
          options={[
            { value: "IN_STOCK", label: "In stock" },
            { value: "LOW_STOCK", label: "Low stock" },
            { value: "OUT_OF_STOCK", label: "Out of stock" },
            { value: "NEGATIVE", label: "Negative stock" },
          ]}
        />
        <div className="ml-auto">
          <ExportMenu getTable={exportTable} />
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(p) => p.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(p) => router.push(`/products/${p.id}`)}
        emptyText="No products match these filters"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
