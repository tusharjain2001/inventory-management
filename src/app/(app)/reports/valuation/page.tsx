"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { useMeta } from "@/hooks/use-meta";
import { formatDateTime, formatINR } from "@/lib/format";
import type { ExportTable } from "@/lib/export";
import {
  amt,
  CategoryFilter,
  categoryName,
  HelpText,
  moneyCol,
  qty,
  qtyCol,
  ReportHeader,
  StatGrid,
  subtitle,
  Toggle,
  TotalsRow,
  useReport,
  useSorted,
  useUrlFilters,
} from "../_components/report-kit";

type ProductRow = {
  id: number;
  name: string;
  sku: string;
  isActive: boolean;
  category: string;
  subCategory: string;
  currentStock: number;
  onDisplayStock: number;
  units: number;
  avgCost: number;
  value: number;
  sharePct: number;
};
type CategoryRow = { id: number; name: string; products: number; currentStock: number; onDisplayStock: number; units: number; avgCost: number; value: number; sharePct: number };
type Data = {
  rows: ProductRow[];
  categories: CategoryRow[];
  totals: { products: number; currentStock: number; onDisplayStock: number; units: number; value: number };
  meta: { costingMethod: string; asOf: string };
};

const pctCol = <T,>(): Column<T> => ({
  key: "sharePct",
  header: "% of Total",
  align: "right",
  sortable: true,
  className: "tabular-nums",
  cell: (r) => `${(r as { sharePct: number }).sharePct.toFixed(2)}%`,
  exportValue: (r) => (r as { sharePct: number }).sharePct,
});

export default function ValuationPage() {
  return (
    <RequirePermission permission="reports.valuation">
      <Suspense>
        <ValuationReport />
      </Suspense>
    </RequirePermission>
  );
}

function ValuationReport() {
  const { data: meta } = useMeta();
  const [f, setF] = useUrlFilters({ view: "category", categoryId: "", subCategoryId: "", zero: "" });
  const [sort, setSort] = useState<SortState>(undefined);
  const params = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== "" && k !== "view"));
  const { data, isFetching } = useReport<Data>("valuation", params);
  const byCategory = f.view === "category";
  const productRows = useSorted(data?.rows, byCategory ? undefined : sort);
  const categoryRows = useSorted(data?.categories, byCategory ? sort : undefined);
  const t = data?.totals;

  const categoryColumns: Column<CategoryRow>[] = [
    {
      key: "name",
      header: "Category",
      sortable: true,
      className: "font-medium",
      cell: (r) => (
        <button type="button" className="font-medium hover:underline" onClick={() => setF({ view: "product", categoryId: String(r.id), subCategoryId: "" })}>
          {r.name}
        </button>
      ),
      exportValue: (r) => r.name,
    },
    { key: "products", header: "Products", align: "right", sortable: true, className: "tabular-nums" },
    qtyCol("currentStock", "Showroom"),
    qtyCol("onDisplayStock", "On Display"),
    qtyCol("units", "Total Units"),
    moneyCol("avgCost", "Avg Cost / Unit"),
    moneyCol("value", "Stock Value", { className: "tabular-nums whitespace-nowrap font-medium" }),
    pctCol<CategoryRow>(),
  ];

  const productColumns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      cell: (r) => (
        <Link href={`/products/${r.id}`} className="font-medium hover:underline">
          {r.name}
          {!r.isActive && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
        </Link>
      ),
    },
    { key: "sku", header: "SKU", sortable: true, className: "font-mono text-xs whitespace-nowrap" },
    {
      key: "category",
      header: "Category",
      sortable: true,
      cell: (r) => (r.subCategory ? `${r.category} › ${r.subCategory}` : r.category),
      exportValue: (r) => (r.subCategory ? `${r.category} › ${r.subCategory}` : r.category),
    },
    qtyCol("currentStock", "Showroom"),
    qtyCol("onDisplayStock", "On Display"),
    qtyCol("units", "Total Units"),
    moneyCol("avgCost", "Avg Cost"),
    moneyCol("value", "Stock Value", { className: "tabular-nums whitespace-nowrap font-medium" }),
    pctCol<ProductRow>(),
  ];

  const totalValues: Record<string, string> = t
    ? {
        products: String(t.products),
        currentStock: qty(t.currentStock),
        onDisplayStock: qty(t.onDisplayStock),
        units: qty(t.units),
        value: amt(t.value),
        sharePct: "100%",
      }
    : {};

  const sub = () =>
    subtitle(null, [
      `As of ${formatDateTime(data?.meta.asOf ?? new Date())}`,
      "Costing method: Weighted average",
      f.categoryId && `Category: ${categoryName(meta, f.categoryId) ?? f.categoryId}`,
    ]);

  const getTable = (): ExportTable<CategoryRow> | ExportTable<ProductRow> =>
    byCategory
      ? { title: "Inventory Valuation by Category", filename: "valuation-category", subtitle: sub(), columns: categoryColumns, rows: categoryRows ?? [], totals: totalValues }
      : { title: "Inventory Valuation by Product", filename: "valuation-product", subtitle: sub(), columns: productColumns, rows: productRows ?? [], totals: totalValues };

  return (
    <>
      <ReportHeader
        title="Inventory Valuation"
        description="What the stock you own is worth at cost"
        getTable={getTable as () => ExportTable<unknown>}
      />

      <FilterBar>
        <CategoryFilter categoryId={f.categoryId} subCategoryId={f.subCategoryId} onChange={(v) => setF(v)} />
        <SimpleSelect
          className="h-9 w-full sm:w-48"
          value={f.zero || "false"}
          onChange={(v) => setF({ zero: v === "true" ? "true" : "" })}
          options={[
            { value: "false", label: "Items with stock" },
            { value: "true", label: "Include zero stock" },
          ]}
        />
      </FilterBar>

      <StatGrid>
        <StatCard label="Total stock value" value={formatINR(t?.value)} loading={!data} />
        <StatCard label="Total units" value={qty(t?.units)} sub={`${qty(t?.onDisplayStock)} on display`} loading={!data} />
        <StatCard label="Products" value={t?.products ?? 0} loading={!data} />
        <StatCard label="Costing method" value={<span className="text-base">Weighted average</span>} loading={!data} />
      </StatGrid>

      <div className="mb-3">
        <Toggle
          value={f.view as "category" | "product"}
          onChange={(view) => {
            setSort(undefined);
            setF({ view });
          }}
          options={[
            { value: "category", label: "By category" },
            { value: "product", label: "By product" },
          ]}
        />
      </div>

      <HelpText>
        Units = showroom stock + stock out on display (still owned). Value = units × weighted-average cost. Average cost is
        recalculated on every purchase, opening stock and cancelled sale.
      </HelpText>

      {byCategory ? (
        <DataTable
          columns={categoryColumns}
          rows={categoryRows}
          loading={isFetching}
          rowKey={(r) => r.id}
          sort={sort}
          onSortChange={setSort}
          dense
          emptyText="No stock"
          footer={t && categoryRows?.length ? <TotalsRow columns={categoryColumns} values={totalValues} /> : undefined}
        />
      ) : (
        <DataTable
          columns={productColumns}
          rows={productRows}
          loading={isFetching}
          rowKey={(r) => r.id}
          sort={sort}
          onSortChange={setSort}
          dense
          emptyText="No stock"
          footer={t && productRows?.length ? <TotalsRow columns={productColumns} values={{ ...totalValues, name: `${t.products} products` }} /> : undefined}
        />
      )}
    </>
  );
}
