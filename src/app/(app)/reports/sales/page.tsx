"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { DateRangeFilter, FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { StatusBadge } from "@/components/common/status-badge";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { useMeta } from "@/hooks/use-meta";
import { formatDate, formatINR, label } from "@/lib/format";
import {
  amt,
  apiParams,
  CategoryFilter,
  categoryName,
  CustomerFilter,
  dateCol,
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

type GroupBy = "line" | "invoice" | "product" | "customer" | "salesperson" | "day";
type Amounts = { quantity: number; gross: number; discount: number; taxable: number; gst: number; total: number };
type Row = Amounts & {
  key: string;
  // line
  invoiceId?: number;
  invoiceNo?: string;
  invoiceDate?: string;
  customer?: string;
  salesperson?: string;
  product?: string;
  sku?: string;
  category?: string;
  paymentStatus?: string;
  // grouped
  label?: string;
  productId?: number;
  orders?: number;
  avgOrderValue?: number;
};
type Totals = Amounts & { orders: number; lines: number; avgOrderValue: number; creditNotes: number; totalAfterCredit: number };
type Data = { rows: Row[]; totals: Totals; meta: { period: string; ownOnly: boolean; capped: boolean } };

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "line", label: "Lines" },
  { value: "invoice", label: "Invoice" },
  { value: "product", label: "Product" },
  { value: "customer", label: "Customer" },
  { value: "salesperson", label: "Salesperson" },
  { value: "day", label: "Day" },
];

const PAYMENT_OPTIONS = ["PAID", "PARTIALLY_PAID", "UNPAID", "OVERDUE", "REFUNDED"].map((s) => ({
  value: s,
  label: s === "UNPAID" ? "Pending (Not Due)" : label(s),
}));

export default function SalesReportPage() {
  return (
    <RequirePermission permission="reports.sales">
      <Suspense>
        <SalesReport />
      </Suspense>
    </RequirePermission>
  );
}

function SalesReport() {
  const { data: meta } = useMeta();
  const { can } = useSession();
  const [f, setF] = useUrlFilters({
    ...thisMonth(),
    groupBy: "line",
    customerId: "",
    customerLabel: "",
    salespersonId: "",
    categoryId: "",
    subCategoryId: "",
    productId: "",
    productLabel: "",
    paymentStatus: "",
  });
  const [sort, setSort] = useState<SortState>(undefined);
  const groupBy = f.groupBy as GroupBy;
  const { data, isFetching } = useReport<Data>("sales", apiParams(f));
  const rows = useSorted(data?.rows, sort);
  const t = data?.totals;

  const invoiceLink = (r: Row) =>
    r.invoiceId ? (
      <Link href={`/sales/invoices/${r.invoiceId}`} className="font-medium whitespace-nowrap hover:underline">
        {r.invoiceNo ?? r.label}
      </Link>
    ) : (
      r.invoiceNo ?? r.label
    );

  const amountCols: Column<Row>[] = [
    qtyCol("quantity", "Qty"),
    moneyCol("gross", "Gross Sales"),
    moneyCol("discount", "Discount"),
    moneyCol("taxable", "Taxable Value"),
    moneyCol("gst", "GST"),
    moneyCol("total", "Net Sales", { className: "tabular-nums whitespace-nowrap font-medium" }),
  ];
  const statusCol: Column<Row> = {
    key: "paymentStatus",
    header: "Payment",
    sortable: true,
    cell: (r) => (r.paymentStatus ? <StatusBadge status={r.paymentStatus} /> : null),
    exportValue: (r) => label(r.paymentStatus),
  };
  const ordersCols: Column<Row>[] = [
    { key: "orders", header: "Invoices", align: "right", sortable: true, className: "tabular-nums" },
    ...amountCols,
    moneyCol("avgOrderValue", "Avg / Invoice"),
  ];

  const columns: Column<Row>[] =
    groupBy === "line"
      ? [
          { key: "invoiceNo", header: "Invoice No", sortable: true, cell: invoiceLink, exportValue: (r) => r.invoiceNo },
          dateCol("invoiceDate", "Date"),
          { key: "customer", header: "Customer", sortable: true },
          { key: "salesperson", header: "Salesperson", sortable: true },
          {
            key: "product",
            header: "Product",
            sortable: true,
            cell: (r) => (
              <div className="min-w-36">
                <div>{r.product}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{r.sku}</div>
              </div>
            ),
            exportValue: (r) => `${r.product} (${r.sku})`,
          },
          { key: "category", header: "Category", sortable: true },
          ...amountCols,
          statusCol,
        ]
      : groupBy === "invoice"
        ? [
            { key: "label", header: "Invoice No", sortable: true, cell: invoiceLink, exportValue: (r) => r.label },
            dateCol("invoiceDate", "Date"),
            { key: "customer", header: "Customer", sortable: true },
            { key: "salesperson", header: "Salesperson", sortable: true },
            ...amountCols,
            statusCol,
          ]
        : groupBy === "product"
          ? [
              {
                key: "label",
                header: "Product",
                sortable: true,
                cell: (r) => (
                  <Link href={`/products/${r.productId}`} className="font-medium hover:underline">
                    {r.label}
                  </Link>
                ),
                exportValue: (r) => r.label,
              },
              { key: "sku", header: "SKU", sortable: true, className: "font-mono text-xs" },
              { key: "category", header: "Category", sortable: true },
              ...ordersCols,
            ]
          : [
              {
                key: "label",
                header: groupBy === "customer" ? "Customer" : groupBy === "salesperson" ? "Salesperson" : "Date",
                sortable: true,
                className: "font-medium whitespace-nowrap",
                cell: (r) => (groupBy === "day" ? formatDate(`${r.label}T12:00:00+05:30`) : r.label),
                exportValue: (r) => (groupBy === "day" ? formatDate(`${r.label}T12:00:00+05:30`) : r.label),
              },
              ...ordersCols,
            ];

  const totalValues: Record<string, string> = t
    ? {
        quantity: qty(t.quantity),
        gross: amt(t.gross),
        discount: amt(t.discount),
        taxable: amt(t.taxable),
        gst: amt(t.gst),
        total: amt(t.total),
        orders: String(t.orders),
        avgOrderValue: amt(t.avgOrderValue),
      }
    : {};

  const filterLines = [
    `Grouped by: ${GROUPS.find((g) => g.value === groupBy)?.label}`,
    f.customerId && `Customer: ${f.customerLabel || f.customerId}`,
    f.salespersonId && `Salesperson: ${userName(meta, f.salespersonId) ?? f.salespersonId}`,
    data?.meta.ownOnly && "Own sales only",
    f.categoryId && `Category: ${categoryName(meta, f.categoryId) ?? f.categoryId}`,
    f.productId && `Product: ${f.productLabel || f.productId}`,
    f.paymentStatus && `Payment status: ${PAYMENT_OPTIONS.find((o) => o.value === f.paymentStatus)?.label}`,
  ];

  return (
    <>
      <ReportHeader
        title="Sales Report"
        description="Sales on active invoices, by invoice date"
        getTable={() => ({
          title: "Sales Report",
          filename: `sales-report-${groupBy}`,
          subtitle: subtitle(f, filterLines),
          columns,
          rows: rows ?? [],
          totals: totalValues,
        })}
      />

      <FilterBar>
        <DateRangeFilter value={f} onChange={(r) => setF(r)} />
        <CustomerFilter id={f.customerId} label={f.customerLabel} onChange={(customerId, customerLabel) => setF({ customerId, customerLabel })} />
        <SalespersonFilter value={f.salespersonId} onChange={(salespersonId) => setF({ salespersonId })} />
        <CategoryFilter categoryId={f.categoryId} subCategoryId={f.subCategoryId} onChange={(v) => setF(v)} />
        <ProductFilter id={f.productId} label={f.productLabel} onChange={(productId, productLabel) => setF({ productId, productLabel })} />
        <SimpleSelect
          className="h-9 w-full sm:w-44"
          value={f.paymentStatus}
          onChange={(paymentStatus) => setF({ paymentStatus })}
          clearLabel="Any Payment Status"
          placeholder="Any Payment Status"
          options={PAYMENT_OPTIONS}
        />
      </FilterBar>

      <StatGrid>
        <StatCard label="Total Sales (incl. GST)" value={formatINR(t?.total)} sub={`Taxable ${formatINR(t?.taxable)}`} loading={!data} />
        <StatCard label="Total Discount" value={formatINR(t?.discount)} loading={!data} />
        <StatCard label="Total GST" value={formatINR(t?.gst)} loading={!data} />
        <StatCard label="Total Orders" value={t?.orders ?? 0} sub={`${qty(t?.quantity)} units`} loading={!data} />
        <StatCard label="Average Order Value" value={formatINR(t?.avgOrderValue)} loading={!data} />
      </StatGrid>
      {!!t?.creditNotes && (
        <HelpText>
          Less credit notes issued in the period: {formatINR(t.creditNotes)} → sales after credit notes {formatINR(t.totalAfterCredit)}.
        </HelpText>
      )}

      <div className="mb-3 overflow-x-auto">
        <Toggle
          value={groupBy}
          onChange={(v) => {
            setSort(undefined);
            setF({ groupBy: v });
          }}
          options={GROUPS}
        />
      </div>

      <HelpText>
        Sales = active invoices by invoice date. Discount = item discount + share of invoice discount. Net sales = line total
        incl. GST (other charges and round-off are not part of item lines).
        {!can("sales.viewAll") && " You see only your own sales."}
        {data?.meta.capped && " Showing the first 20,000 lines — narrow the filters."}
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
