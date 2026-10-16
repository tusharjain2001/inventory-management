"use client";

import { Suspense, useState } from "react";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { DateRangeFilter, FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { useMeta } from "@/hooks/use-meta";
import { formatINR, label } from "@/lib/format";
import {
  amt,
  apiParams,
  CategoryFilter,
  categoryName,
  dateCol,
  HelpText,
  moneyCol,
  ProductFilter,
  qty,
  qtyCol,
  ReportHeader,
  StatGrid,
  subtitle,
  SupplierFilter,
  supplierName,
  thisMonth,
  TotalsRow,
  useReport,
  useSorted,
  useUrlFilters,
} from "../_components/report-kit";

type Row = {
  id: number;
  stockInId: number;
  stockInNo: string;
  date: string;
  source: string;
  supplier: string;
  purchaseInvoiceNo: string;
  productId: number;
  product: string;
  sku: string;
  category: string;
  quantity: number;
  unitCost?: number;
  discount?: number;
  taxable?: number;
  gstRate?: number;
  gst?: number;
  total?: number;
};
type Totals = { lines: number; documents: number; suppliers: number; quantity: number; discount?: number; taxable?: number; gst?: number; total?: number };
type Data = { rows: Row[]; totals: Totals; meta: { period: string; showCost: boolean } };

const SOURCES = ["PURCHASE", "SUPPLIER_RECEIPT", "OPENING", "MANUAL"];

export default function PurchaseReportPage() {
  return (
    <RequirePermission permission="reports.purchase">
      <Suspense>
        <PurchaseReport />
      </Suspense>
    </RequirePermission>
  );
}

function PurchaseReport() {
  const { data: meta } = useMeta();
  const [f, setF] = useUrlFilters({ ...thisMonth(), supplierId: "", productId: "", productLabel: "", categoryId: "", source: "" });
  const [sort, setSort] = useState<SortState>(undefined);
  const { data, isFetching } = useReport<Data>("purchase", apiParams(f));
  const rows = useSorted(data?.rows, sort);
  const t = data?.totals;
  const showCost = data?.meta.showCost ?? false;

  const columns: Column<Row>[] = [
    { key: "stockInNo", header: "Stock-in No", sortable: true, className: "font-medium whitespace-nowrap" },
    dateCol("date", "Date"),
    { key: "source", header: "Source", sortable: true, cell: (r) => label(r.source), exportValue: (r) => label(r.source) },
    { key: "supplier", header: "Supplier", sortable: true, cell: (r) => r.supplier || "—" },
    { key: "purchaseInvoiceNo", header: "Supplier Inv No", sortable: true },
    { key: "product", header: "Product", sortable: true, className: "min-w-36" },
    { key: "sku", header: "SKU", sortable: true, className: "font-mono text-xs whitespace-nowrap" },
    qtyCol("quantity", "Qty"),
    ...(showCost
      ? [
          moneyCol<Row>("unitCost", "Purchase Price"),
          moneyCol<Row>("discount", "Discount"),
          moneyCol<Row>("taxable", "Taxable"),
          { key: "gstRate", header: "GST %", align: "right", sortable: true, cell: (r: Row) => `${r.gstRate ?? 0}%` } as Column<Row>,
          moneyCol<Row>("gst", "GST"),
          moneyCol<Row>("total", "Total Value", { className: "tabular-nums whitespace-nowrap font-medium" }),
        ]
      : []),
  ];

  const totalValues: Record<string, string> = t
    ? {
        quantity: qty(t.quantity),
        ...(showCost ? { discount: amt(t.discount), taxable: amt(t.taxable), gst: amt(t.gst), total: amt(t.total) } : {}),
      }
    : {};

  return (
    <>
      <ReportHeader
        title="Purchase Report"
        description="Stock received from suppliers and other stock-in entries"
        getTable={() => ({
          title: "Purchase Report",
          filename: "purchase-report",
          subtitle: subtitle(f, [
            f.supplierId && `Supplier: ${supplierName(meta, f.supplierId) ?? f.supplierId}`,
            f.categoryId && `Category: ${categoryName(meta, f.categoryId) ?? f.categoryId}`,
            f.productId && `Product: ${f.productLabel || f.productId}`,
            f.source && `Source: ${label(f.source)}`,
          ]),
          columns,
          rows: rows ?? [],
          totals: totalValues,
        })}
      />

      <FilterBar>
        <DateRangeFilter value={f} onChange={(r) => setF(r)} />
        <SupplierFilter value={f.supplierId} onChange={(supplierId) => setF({ supplierId })} />
        <CategoryFilter categoryId={f.categoryId} showSub={false} onChange={({ categoryId }) => setF({ categoryId })} />
        <ProductFilter id={f.productId} label={f.productLabel} onChange={(productId, productLabel) => setF({ productId, productLabel })} />
        <SimpleSelect
          className="h-9 w-full sm:w-44"
          value={f.source}
          onChange={(source) => setF({ source })}
          clearLabel="All sources"
          placeholder="All sources"
          options={SOURCES.map((s) => ({ value: s, label: label(s) }))}
        />
      </FilterBar>

      <StatGrid>
        <StatCard label="Stock-in entries" value={t?.documents ?? 0} sub={`${t?.lines ?? 0} lines`} loading={!data} />
        <StatCard label="Suppliers" value={t?.suppliers ?? 0} loading={!data} />
        <StatCard label="Units received" value={qty(t?.quantity)} loading={!data} />
        {showCost && <StatCard label="Total purchase value" value={formatINR(t?.total)} sub={`Taxable ${formatINR(t?.taxable)}`} loading={!data} />}
        {showCost && <StatCard label="Input GST" value={formatINR(t?.gst)} loading={!data} />}
      </StatGrid>

      <HelpText>
        Includes opening stock and manual stock-in entries; use the source filter to see purchases only.
        {!showCost && " Prices are hidden because you don't have permission to see purchase cost."}
      </HelpText>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isFetching}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        dense
        emptyText="No stock-in entries match these filters"
        footer={t && rows?.length ? <TotalsRow columns={columns} values={totalValues} /> : undefined}
      />
    </>
  );
}
