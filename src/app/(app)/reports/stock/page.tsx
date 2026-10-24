"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { DateRangeFilter, FilterBar, SearchInput } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { useMeta } from "@/hooks/use-meta";
import { formatINR } from "@/lib/format";
import {
  amt,
  apiParams,
  CategoryFilter,
  categoryName,
  HelpText,
  moneyCol,
  qty,
  qtyCol,
  ReportHeader,
  StatGrid,
  subtitle,
  thisMonth,
  TotalsRow,
  useReport,
  useSorted,
  useUrlFilters,
} from "../_components/report-kit";

type Row = {
  id: number;
  sku: string;
  name: string;
  category: string;
  isActive: boolean;
  opening: number;
  stockIn: number;
  sold: number;
  display: number;
  damaged: number;
  lost: number;
  adjustments: number;
  closing: number;
  displayClosing: number;
  avgCost?: number;
  stockValue?: number;
};
type Totals = Omit<Row, "id" | "sku" | "name" | "category" | "isActive" | "avgCost"> & { products: number };
type Data = { rows: Row[]; totals: Totals; meta: { period: string; showCost: boolean } };

export default function StockReportPage() {
  return (
    <RequirePermission permission="reports.stock">
      <Suspense>
        <StockReport />
      </Suspense>
    </RequirePermission>
  );
}

function StockReport() {
  const { data: meta } = useMeta();
  const [f, setF] = useUrlFilters({ ...thisMonth(), categoryId: "", subCategoryId: "", q: "", inactive: "" });
  const [sort, setSort] = useState<SortState>(undefined);
  const params = apiParams(f);
  const { data, isFetching } = useReport<Data>("stock", params);
  const rows = useSorted(data?.rows, sort);
  const showCost = data?.meta.showCost ?? false;
  const t = data?.totals;

  const columns: Column<Row>[] = [
    { key: "sku", header: "SKU", sortable: true, className: "font-mono text-xs whitespace-nowrap" },
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
    { key: "category", header: "Category", sortable: true },
    qtyCol("opening", "Opening"),
    qtyCol("stockIn", "Stock In"),
    qtyCol("sold", "Stock Out (Sold)", { exportHeader: "Stock Out" }),
    qtyCol("display", "Display"),
    qtyCol("damaged", "Damaged"),
    qtyCol("lost", "Lost"),
    qtyCol("adjustments", "Adjustments"),
    qtyCol("closing", "Closing Stock", { className: "tabular-nums font-medium" }),
    qtyCol("displayClosing", "On Display"),
    ...(showCost ? [moneyCol<Row>("avgCost", "Avg Cost"), moneyCol<Row>("stockValue", "Stock Value")] : []),
  ];

  const totalValues = t
    ? {
        sku: "Total",
        name: `${t.products} products`,
        opening: qty(t.opening),
        stockIn: qty(t.stockIn),
        sold: qty(t.sold),
        display: qty(t.display),
        damaged: qty(t.damaged),
        lost: qty(t.lost),
        adjustments: qty(t.adjustments),
        closing: qty(t.closing),
        displayClosing: qty(t.displayClosing),
        ...(showCost ? { stockValue: amt(t.stockValue) } : {}),
      }
    : {};

  return (
    <>
      <ReportHeader
        title="Stock Report"
        description="Stock movement per product for the period"
        getTable={() => ({
          title: "Stock Report",
          filename: "stock-report",
          subtitle: subtitle(f, [
            f.categoryId && `Category: ${categoryName(meta, f.categoryId) ?? f.categoryId}`,
            f.q && `Search: ${f.q}`,
            f.inactive === "true" && "Including inactive products",
          ]),
          columns,
          rows: rows ?? [],
          totals: totalValues as Record<string, string>,
        })}
      />

      <FilterBar>
        <DateRangeFilter value={f} onChange={(r) => setF(r)} />
        <CategoryFilter categoryId={f.categoryId} subCategoryId={f.subCategoryId} onChange={(v) => setF(v)} />
        <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Product name or SKU" />
        <SimpleSelect
          className="h-9 w-full sm:w-40"
          value={f.inactive || "false"}
          onChange={(v) => setF({ inactive: v === "true" ? "true" : "" })}
          options={[
            { value: "false", label: "Active Products" },
            { value: "true", label: "Include Inactive" },
          ]}
        />
      </FilterBar>

      <StatGrid>
        <StatCard label="Products" value={t?.products ?? 0} loading={!data} />
        <StatCard label="Stock In" value={qty(t?.stockIn)} loading={!data} />
        <StatCard label="Sold (Net of Cancellations)" value={qty(t?.sold)} loading={!data} />
        <StatCard label="Closing Stock (Showroom)" value={qty(t?.closing)} sub={`+ ${qty(t?.displayClosing)} on display`} loading={!data} />
        {showCost && <StatCard label="Closing Stock Value" value={formatINR(t?.stockValue)} loading={!data} />}
      </StatGrid>

      <HelpText>
        Opening = stock before the start date. Display = net sent out for display (out − returned). Adjustments = net
        increase − decrease. Closing = opening + all movements in the period (showroom stock).
        {showCost && " Stock value = (closing + on display) × current weighted-average cost."}
      </HelpText>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isFetching}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        dense
        emptyText="No products match these filters"
        footer={t && rows?.length ? <TotalsRow columns={columns} values={totalValues} /> : undefined}
      />
    </>
  );
}
