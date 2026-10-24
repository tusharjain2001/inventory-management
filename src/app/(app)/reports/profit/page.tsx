"use client";

import { Suspense, useState } from "react";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { DateRangeFilter, FilterBar } from "@/components/common/filters";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { useMeta } from "@/hooks/use-meta";
import { formatDate, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  amt,
  apiParams,
  CategoryFilter,
  categoryName,
  CustomerFilter,
  HelpText,
  moneyCol,
  ProductFilter,
  qty,
  qtyCol,
  ReportHeader,
  SalespersonFilter,
  StatGrid,
  subtitle,
  thisMonth,
  Toggle,
  TotalsRow,
  useReport,
  userName,
  useSorted,
  useUrlFilters,
} from "../_components/report-kit";

type Row = {
  key: string;
  label: string;
  sub?: string;
  date?: string;
  quantity: number;
  sales: number;
  discount: number;
  netSales: number;
  creditNotes: number;
  netRevenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  gst: number;
};
type Totals = Omit<Row, "key" | "label" | "sub" | "date">;
type Data = { rows: Row[]; totals: Totals; meta: { period: string; ownOnly: boolean } };

export default function ProfitReportPage() {
  return (
    <RequirePermission permission="reports.profit">
      <Suspense>
        <ProfitReport />
      </Suspense>
    </RequirePermission>
  );
}

const pctText = (n: number | undefined) => `${(n ?? 0).toFixed(2)}%`;

function ProfitReport() {
  const { data: meta } = useMeta();
  const { can } = useSession();
  const [f, setF] = useUrlFilters({
    ...thisMonth(),
    groupBy: "product",
    categoryId: "",
    subCategoryId: "",
    productId: "",
    productLabel: "",
    customerId: "",
    customerLabel: "",
    salespersonId: "",
  });
  const [sort, setSort] = useState<SortState>(undefined);
  const byInvoice = f.groupBy === "invoice";
  const { data, isFetching } = useReport<Data>("profit", apiParams(f));
  const rows = useSorted(data?.rows, sort);
  const t = data?.totals;

  const columns: Column<Row>[] = [
    {
      key: "label",
      header: byInvoice ? "Invoice" : "Product",
      sortable: true,
      cell: (r) => (
        <div className="min-w-36">
          <div className="font-medium">{r.label}</div>
          {(r.sub || r.date) && (
            <div className="text-xs text-muted-foreground">{[r.date && formatDate(r.date), r.sub].filter(Boolean).join(" · ")}</div>
          )}
        </div>
      ),
      exportValue: (r) => r.label,
    },
    qtyCol("quantity", "Qty"),
    moneyCol("sales", "Sales (Gross)"),
    moneyCol("discount", "Discount"),
    moneyCol("creditNotes", "Credit Notes"),
    moneyCol("netRevenue", "Net Revenue"),
    moneyCol("cogs", "Cost (COGS)"),
    moneyCol("profit", "Gross Profit", {
      cell: (r) => <span className={cn("font-medium", r.profit < 0 && "text-destructive")}>{amt(r.profit)}</span>,
    }),
    {
      key: "marginPct",
      header: "Margin %",
      align: "right",
      sortable: true,
      className: "tabular-nums",
      cell: (r) => <span className={cn(r.marginPct < 0 && "text-destructive")}>{pctText(r.marginPct)}</span>,
      exportValue: (r) => r.marginPct,
    },
    moneyCol("gst", "GST"),
  ];

  // Exports get the date / customer (or SKU / category) as their own columns.
  const exportColumns: Column<Row>[] = [
    columns[0],
    ...(byInvoice
      ? [
          { key: "date", header: "Date", exportValue: (r: Row) => (r.date ? formatDate(r.date) : "") },
          { key: "sub", header: "Customer", exportValue: (r: Row) => r.sub ?? "" },
        ]
      : [{ key: "sub", header: "SKU · Category", exportValue: (r: Row) => r.sub ?? "" }]),
    ...columns.slice(1),
  ];

  const totalValues: Record<string, string> = t
    ? {
        quantity: qty(t.quantity),
        sales: amt(t.sales),
        discount: amt(t.discount),
        creditNotes: amt(t.creditNotes),
        netRevenue: amt(t.netRevenue),
        cogs: amt(t.cogs),
        profit: amt(t.profit),
        marginPct: pctText(t.marginPct),
        gst: amt(t.gst),
      }
    : {};

  return (
    <>
      <ReportHeader
        title="Profit Report"
        description="Gross profit on sales, at weighted-average cost"
        getTable={() => ({
          title: `Profit Report (${byInvoice ? "by invoice" : "by product"})`,
          filename: `profit-report-${f.groupBy}`,
          subtitle: subtitle(f, [
            f.categoryId && `Category: ${categoryName(meta, f.categoryId) ?? f.categoryId}`,
            f.productId && `Product: ${f.productLabel || f.productId}`,
            f.customerId && `Customer: ${f.customerLabel || f.customerId}`,
            f.salespersonId && `Salesperson: ${userName(meta, f.salespersonId) ?? f.salespersonId}`,
            data?.meta.ownOnly && "Own sales only",
            "Costing method: Weighted average",
          ]),
          columns: exportColumns,
          rows: rows ?? [],
          totals: totalValues,
        })}
      />

      <FilterBar>
        <DateRangeFilter value={f} onChange={(r) => setF(r)} />
        <CategoryFilter categoryId={f.categoryId} subCategoryId={f.subCategoryId} onChange={(v) => setF(v)} />
        <ProductFilter id={f.productId} label={f.productLabel} onChange={(productId, productLabel) => setF({ productId, productLabel })} />
        <CustomerFilter id={f.customerId} label={f.customerLabel} onChange={(customerId, customerLabel) => setF({ customerId, customerLabel })} />
        <SalespersonFilter value={f.salespersonId} onChange={(salespersonId) => setF({ salespersonId })} />
      </FilterBar>

      <StatGrid>
        <StatCard label="Net Revenue" value={formatINR(t?.netRevenue)} sub={`Sales ${formatINR(t?.sales)}`} loading={!data} />
        <StatCard label="Cost of Goods Sold" value={formatINR(t?.cogs)} sub={`${qty(t?.quantity)} units`} loading={!data} />
        <StatCard label="Gross Profit" value={formatINR(t?.profit)} loading={!data} />
        <StatCard label="Gross Margin" value={pctText(t?.marginPct)} loading={!data} />
        <StatCard label="Discount Given" value={formatINR(t?.discount)} sub={`Credit notes ${formatINR(t?.creditNotes)}`} loading={!data} />
      </StatGrid>

      <div className="mb-3">
        <Toggle
          value={f.groupBy as "product" | "invoice"}
          onChange={(groupBy) => {
            setSort(undefined);
            setF({ groupBy });
          }}
          options={[
            { value: "product", label: "By Product" },
            { value: "invoice", label: "By Invoice" },
          ]}
        />
      </div>

      <HelpText>
        Net revenue = taxable value (after discounts, excl. GST) − credit-note taxable value. Cost = quantity × weighted-average
        cost at the time of sale. Gross profit = net revenue − cost; margin = profit ÷ net revenue. Other charges count as
        revenue with no cost.
        {!can("sales.viewAll") && " You see only your own sales."}
      </HelpText>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isFetching}
        rowKey={(r) => r.key}
        sort={sort}
        onSortChange={setSort}
        dense
        emptyText="No sales match these filters"
        footer={t && rows?.length ? <TotalsRow columns={columns} values={totalValues} /> : undefined}
      />
    </>
  );
}
