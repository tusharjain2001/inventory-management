"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { useMeta } from "@/hooks/use-meta";
import { formatDate, formatINR } from "@/lib/format";
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
  supplier: string | null;
  currentStock: number;
  onDisplayStock: number;
  ownedStock: number;
  avgCost?: number;
  stockValue?: number;
  lastSaleAt: string | null;
  firstMovementAt: string | null;
  daysSince: number;
};
type Data = {
  rows: Row[];
  totals: { products: number; currentStock: number; onDisplayStock: number; ownedStock: number; neverSold: number; stockValue?: number };
  meta: { days: number; defaultDays: number; showCost: boolean };
};

const DAY_OPTIONS = [30, 60, 90, 180, 365];

export default function DeadStockPage() {
  return (
    <RequirePermission permission="reports.valuation">
      <Suspense>
        <DeadStockReport />
      </Suspense>
    </RequirePermission>
  );
}

function DeadStockReport() {
  const { data: meta } = useMeta();
  const [f, setF] = useUrlFilters({ days: "", categoryId: "", subCategoryId: "", supplierId: "" });
  const [sort, setSort] = useState<SortState>(undefined);
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));
  const { data, isFetching } = useReport<Data>("dead-stock", params);
  const rows = useSorted(data?.rows, sort);
  const t = data?.totals;
  const days = data?.meta.days;
  const showCost = data?.meta.showCost ?? false;
  const dayOptions = [...new Set([...DAY_OPTIONS, data?.meta.defaultDays ?? 90])].sort((a, b) => a - b);

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
    qtyCol("currentStock", "Current Stock"),
    qtyCol("onDisplayStock", "On Display"),
    ...(showCost ? [moneyCol<Row>("avgCost", "Purchase Cost (Avg)"), moneyCol<Row>("stockValue", "Stock Value")] : []),
    {
      key: "lastSaleAt",
      header: "Last Sale",
      sortable: true,
      className: "whitespace-nowrap",
      cell: (r) => (r.lastSaleAt ? formatDate(r.lastSaleAt) : <span className="text-muted-foreground">Never</span>),
      exportValue: (r) => (r.lastSaleAt ? formatDate(r.lastSaleAt) : "Never"),
    },
    {
      key: "daysSince",
      header: "Days Since Sale",
      align: "right",
      sortable: true,
      className: "tabular-nums font-medium",
      cell: (r) => (
        <span title={r.lastSaleAt ? undefined : "Never sold: days since first stock movement"}>
          {r.daysSince.toLocaleString("en-IN")}
          {!r.lastSaleAt && "*"}
        </span>
      ),
      exportValue: (r) => r.daysSince,
    },
    { key: "supplier", header: "Supplier", sortable: true, cell: (r) => r.supplier || "—", exportValue: (r) => r.supplier ?? "" },
  ];

  const totalValues: Record<string, string> = t
    ? {
        name: `${t.products} products`,
        currentStock: qty(t.currentStock),
        onDisplayStock: qty(t.onDisplayStock),
        ...(showCost ? { stockValue: amt(t.stockValue) } : {}),
      }
    : {};

  return (
    <>
      <ReportHeader
        title="Dead Stock"
        description="Items in stock that have not sold for a long time"
        getTable={() => ({
          title: "Dead Stock Report",
          filename: "dead-stock",
          subtitle: subtitle(null, [
            days && `No sale for ${days} days or more`,
            f.categoryId && `Category: ${categoryName(meta, f.categoryId) ?? f.categoryId}`,
            f.supplierId && `Supplier: ${supplierName(meta, f.supplierId) ?? f.supplierId}`,
          ]),
          columns,
          rows: rows ?? [],
          totals: totalValues,
        })}
      />

      <FilterBar>
        <SimpleSelect
          className="h-9 w-full sm:w-52"
          value={f.days || String(days ?? "")}
          onChange={(v) => setF({ days: v })}
          placeholder="No sale for…"
          options={dayOptions.map((d) => ({ value: String(d), label: `No sale for ${d}+ days` }))}
        />
        <CategoryFilter categoryId={f.categoryId} subCategoryId={f.subCategoryId} onChange={(v) => setF(v)} />
        <SupplierFilter value={f.supplierId} onChange={(supplierId) => setF({ supplierId })} />
      </FilterBar>

      <StatGrid>
        <StatCard label="Dead Stock Items" value={t?.products ?? 0} sub={days ? `No sale for ${days}+ days` : undefined} loading={!data} />
        <StatCard label="Units" value={qty(t?.ownedStock)} sub={`${qty(t?.onDisplayStock)} on display`} loading={!data} />
        <StatCard label="Never Sold" value={t?.neverSold ?? 0} loading={!data} />
        {showCost && <StatCard label="Value Locked in Dead Stock" value={formatINR(t?.stockValue)} loading={!data} />}
      </StatGrid>

      <HelpText>
        Active products with stock (showroom + display) and no sale on an active invoice for the selected number of days.
        * Never sold: counted from the first stock movement. Value = units × weighted-average cost.
      </HelpText>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isFetching}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        dense
        emptyText="No dead stock — every item in stock has sold recently"
        footer={t && rows?.length ? <TotalsRow columns={columns} values={totalValues} /> : undefined}
      />
    </>
  );
}
