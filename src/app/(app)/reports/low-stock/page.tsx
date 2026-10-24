"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { StatusBadge } from "@/components/common/status-badge";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { useMeta } from "@/hooks/use-meta";
import { formatDate, label } from "@/lib/format";
import {
  CategoryFilter,
  categoryName,
  dateCol,
  HelpText,
  qty,
  qtyCol,
  ReportHeader,
  StatGrid,
  subtitle,
  SupplierFilter,
  supplierName,
  TotalsRow,
  useReport,
  useSorted,
  useUrlFilters,
} from "../_components/report-kit";

type Row = {
  id: number;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
  onDisplayStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  suggestedOrder: number;
  lastPurchaseAt: string | null;
  supplier: string;
  status: string;
};
type Data = { rows: Row[]; totals: { products: number; out: number; low: number; suggestedOrder: number } };

const LEVELS = [
  { value: "all", label: "At or Below Reorder Level" },
  { value: "low", label: "Low Stock Only" },
  { value: "out", label: "Out of Stock Only" },
];

export default function LowStockPage() {
  return (
    <RequirePermission permission="reports.stock">
      <Suspense>
        <LowStockReport />
      </Suspense>
    </RequirePermission>
  );
}

function LowStockReport() {
  const { data: meta } = useMeta();
  const [f, setF] = useUrlFilters({ level: "all", categoryId: "", subCategoryId: "", supplierId: "" });
  const [sort, setSort] = useState<SortState>(undefined);
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));
  const { data, isFetching } = useReport<Data>("low-stock", params);
  const rows = useSorted(data?.rows, sort);
  const t = data?.totals;

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      cell: (r) => (
        <Link href={`/products/${r.id}`} className="font-medium hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: "sku", header: "SKU", sortable: true, className: "font-mono text-xs whitespace-nowrap" },
    { key: "category", header: "Category", sortable: true },
    qtyCol("currentStock", "Current Stock", { className: "tabular-nums font-medium" }),
    qtyCol("onDisplayStock", "On Display"),
    qtyCol("reorderLevel", "Reorder Level"),
    qtyCol("reorderQuantity", "Reorder Qty"),
    qtyCol("suggestedOrder", "Suggested Order"),
    dateCol("lastPurchaseAt", "Last Purchase", { cell: (r) => (r.lastPurchaseAt ? formatDate(r.lastPurchaseAt) : "—") }),
    { key: "supplier", header: "Preferred Supplier", sortable: true, cell: (r) => r.supplier || "—" },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, exportValue: (r) => label(r.status) },
  ];

  const totalValues: Record<string, string> = t ? { name: `${t.products} products`, suggestedOrder: qty(t.suggestedOrder) } : {};

  return (
    <>
      <ReportHeader
        title="Low Stock Report"
        description="Items to reorder"
        getTable={() => ({
          title: "Low Stock Report",
          filename: "low-stock",
          subtitle: subtitle(null, [
            LEVELS.find((l) => l.value === f.level)?.label,
            f.categoryId && `Category: ${categoryName(meta, f.categoryId) ?? f.categoryId}`,
            f.supplierId && `Supplier: ${supplierName(meta, f.supplierId) ?? f.supplierId}`,
          ]),
          columns,
          rows: rows ?? [],
          totals: totalValues,
        })}
      />

      <FilterBar>
        <SimpleSelect className="h-9 w-full sm:w-56" value={f.level} onChange={(level) => setF({ level })} options={LEVELS} />
        <CategoryFilter categoryId={f.categoryId} subCategoryId={f.subCategoryId} onChange={(v) => setF(v)} />
        <SupplierFilter value={f.supplierId} onChange={(supplierId) => setF({ supplierId })} />
      </FilterBar>

      <StatGrid>
        <StatCard label="Items to Reorder" value={t?.products ?? 0} loading={!data} />
        <StatCard label="Out of Stock" value={t?.out ?? 0} loading={!data} onClick={() => setF({ level: "out" })} />
        <StatCard label="Low Stock" value={t?.low ?? 0} loading={!data} onClick={() => setF({ level: "low" })} />
        <StatCard label="Suggested Order (Units)" value={qty(t?.suggestedOrder)} loading={!data} />
      </StatGrid>

      <HelpText>
        Active products whose showroom stock is at or below the reorder level. Suggested order = reorder quantity, or enough to
        get back above the reorder level when no reorder quantity is set.
      </HelpText>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isFetching}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        dense
        emptyText="Nothing to reorder"
        footer={t && rows?.length ? <TotalsRow columns={columns} values={totalValues} /> : undefined}
      />
    </>
  );
}
