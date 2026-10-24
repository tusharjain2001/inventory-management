"use client";

import { Suspense } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/common/data-table";
import { DateRangeFilter, FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { formatINR } from "@/lib/format";
import type { ExportTable } from "@/lib/export";
import {
  amt,
  apiParams,
  CustomerFilter,
  dateCol,
  HelpText,
  moneyCol,
  ReportHeader,
  StatGrid,
  subtitle,
  thisMonth,
  Toggle,
  TotalsRow,
  useReport,
  useUrlFilters,
} from "../_components/report-kit";

type TaxSum = { taxable: number; cgst: number; sgst: number; igst: number; cess: number; totalTax: number; total: number };
type HsnRow = { hsnCode: string; gstRate: number; taxableValue: number; cgst: number; sgst: number; igst: number; cess: number; totalTax: number };
type RateRow = TaxSum & { gstRate: number };
type InvoiceRow = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  customer: string;
  gstin: string;
  type: "B2B" | "B2C";
  placeOfSupply: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
};
type CreditRow = {
  id: number;
  creditNoteNo: string;
  date: string;
  invoiceNo: string;
  customer: string;
  gstin: string;
  reason: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
};
type InputRow = { gstRate: number; taxable: number; gst: number; total: number };
type Data = {
  rows: InvoiceRow[];
  hsn: HsnRow[];
  rates: RateRow[];
  split: { B2B: TaxSum & { invoices: number }; B2C: TaxSum & { invoices: number } };
  creditNotes: CreditRow[];
  inputGst: { taxable: number; gst: number; byRate: InputRow[] };
  totals: { invoices: number; sales: TaxSum; creditNotes: TaxSum; netTaxable: number; outputTax: number; inputTax: number; netTax: number };
  meta: { period: string };
};

type Tab = "hsn" | "rate" | "invoices" | "credit" | "input";
const TABS: { value: Tab; label: string }[] = [
  { value: "hsn", label: "HSN Summary" },
  { value: "rate", label: "Rate-Wise" },
  { value: "invoices", label: "B2B / B2C Invoices" },
  { value: "credit", label: "Credit Notes" },
  { value: "input", label: "Input GST" },
];

const noSort = <T,>(cols: Column<T>[]): Column<T>[] => cols.map((c) => ({ ...c, sortable: false }));

const rateCol = <T,>(): Column<T> => ({
  key: "gstRate",
  header: "GST Rate",
  align: "right",
  className: "tabular-nums",
  cell: (r) => `${(r as { gstRate: number }).gstRate}%`,
  exportValue: (r) => (r as { gstRate: number }).gstRate,
});
const taxCols = <T,>(): Column<T>[] => [
  moneyCol<T>("cgst", "CGST"),
  moneyCol<T>("sgst", "SGST"),
  moneyCol<T>("igst", "IGST"),
  moneyCol<T>("cess", "Cess"),
];

export default function GstReportPage() {
  return (
    <RequirePermission permission="reports.gst">
      <Suspense>
        <GstReport />
      </Suspense>
    </RequirePermission>
  );
}

function GstReport() {
  const [f, setF] = useUrlFilters({ ...thisMonth(), tab: "hsn", type: "", customerId: "", customerLabel: "" });
  const tab = f.tab as Tab;
  const { data, isFetching } = useReport<Data>("gst", apiParams(f, ["tab", "type"]));
  const t = data?.totals;

  const hsnColumns: Column<HsnRow>[] = [
    { key: "hsnCode", header: "HSN / SAC", className: "font-mono text-xs" },
    rateCol<HsnRow>(),
    moneyCol<HsnRow>("taxableValue", "Taxable Value"),
    ...taxCols<HsnRow>(),
    moneyCol<HsnRow>("totalTax", "Total Tax", { className: "tabular-nums whitespace-nowrap font-medium" }),
  ];
  const rateColumns: Column<RateRow>[] = [
    rateCol<RateRow>(),
    moneyCol<RateRow>("taxable", "Taxable Value"),
    ...taxCols<RateRow>(),
    moneyCol<RateRow>("totalTax", "Total Tax"),
    moneyCol<RateRow>("total", "Value incl. Tax", { className: "tabular-nums whitespace-nowrap font-medium" }),
  ];
  const invoiceColumns = noSort<InvoiceRow>([
    {
      key: "invoiceNo",
      header: "Invoice No",
      cell: (r) => (
        <Link href={`/sales/invoices/${r.id}`} className="font-medium whitespace-nowrap hover:underline">
          {r.invoiceNo}
        </Link>
      ),
      exportValue: (r) => r.invoiceNo,
    },
    dateCol<InvoiceRow>("invoiceDate", "Date", { sortable: false }),
    { key: "customer", header: "Customer" },
    { key: "gstin", header: "GSTIN", className: "font-mono text-xs", cell: (r) => r.gstin || "—" },
    { key: "type", header: "Type" },
    { key: "placeOfSupply", header: "Place of Supply", className: "whitespace-nowrap" },
    moneyCol<InvoiceRow>("taxable", "Taxable"),
    ...taxCols<InvoiceRow>(),
    moneyCol<InvoiceRow>("total", "Invoice Total", { className: "tabular-nums whitespace-nowrap font-medium" }),
  ]);
  const creditColumns = noSort<CreditRow>([
    { key: "creditNoteNo", header: "Credit Note No", className: "font-medium whitespace-nowrap" },
    dateCol<CreditRow>("date", "Date", { sortable: false }),
    { key: "invoiceNo", header: "Against Invoice", className: "whitespace-nowrap" },
    { key: "customer", header: "Customer" },
    { key: "gstin", header: "GSTIN", className: "font-mono text-xs", cell: (r) => r.gstin || "—" },
    { key: "reason", header: "Reason" },
    moneyCol<CreditRow>("taxable", "Taxable"),
    ...taxCols<CreditRow>(),
    moneyCol<CreditRow>("total", "Total", { className: "tabular-nums whitespace-nowrap font-medium" }),
  ]);
  const inputColumns = noSort<InputRow>([
    rateCol<InputRow>(),
    moneyCol<InputRow>("taxable", "Taxable Value"),
    moneyCol<InputRow>("gst", "Input GST"),
    moneyCol<InputRow>("total", "Purchase Value"),
  ]);

  const sum = <R,>(rows: R[] | undefined, keys: string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = amt((rows ?? []).reduce((s, r) => s + ((r as Record<string, number>)[k] ?? 0), 0));
    return out;
  };
  const invoices = (data?.rows ?? []).filter((r) => !f.type || r.type === f.type);

  const table = (() => {
    switch (tab) {
      case "hsn":
        return {
          title: "HSN-Wise Summary (Sales Less Credit Notes)",
          columns: hsnColumns,
          rows: data?.hsn,
          totals: sum(data?.hsn, ["taxableValue", "cgst", "sgst", "igst", "cess", "totalTax"]),
          empty: "No sales in this period",
        };
      case "rate":
        return {
          title: "Rate-Wise Summary (Sales Less Credit Notes)",
          columns: rateColumns,
          rows: data?.rates,
          totals: sum(data?.rates, ["taxable", "cgst", "sgst", "igst", "cess", "totalTax", "total"]),
          empty: "No sales in this period",
        };
      case "invoices":
        return {
          title: `${f.type || "B2B / B2C"} Invoices`,
          columns: invoiceColumns,
          rows: invoices,
          totals: sum(invoices, ["taxable", "cgst", "sgst", "igst", "cess", "total"]),
          empty: "No invoices in this period",
        };
      case "credit":
        return {
          title: "Credit Notes",
          columns: creditColumns,
          rows: data?.creditNotes,
          totals: sum(data?.creditNotes, ["taxable", "cgst", "sgst", "igst", "cess", "total"]),
          empty: "No credit notes in this period",
        };
      default:
        return {
          title: "Input GST on Purchases",
          columns: inputColumns,
          rows: data?.inputGst.byRate,
          totals: sum(data?.inputGst.byRate, ["taxable", "gst", "total"]),
          empty: "No purchases in this period",
        };
    }
  })() as { title: string; columns: Column<unknown>[]; rows: unknown[] | undefined; totals: Record<string, string>; empty: string };

  return (
    <>
      <ReportHeader
        title="GST Report"
        description="Output tax on sales, credit notes and input tax on purchases"
        getTable={() =>
          ({
            title: `GST Report — ${table.title}`,
            filename: `gst-${tab}`,
            subtitle: subtitle(f, [f.customerId && `Customer: ${f.customerLabel || f.customerId}`]),
            columns: table.columns,
            rows: table.rows ?? [],
            totals: table.totals,
          }) as ExportTable<unknown>
        }
      />

      <FilterBar>
        <DateRangeFilter value={f} onChange={(r) => setF(r)} />
        <CustomerFilter id={f.customerId} label={f.customerLabel} onChange={(customerId, customerLabel) => setF({ customerId, customerLabel })} />
      </FilterBar>

      <StatGrid>
        <StatCard
          label="Taxable Sales (Net)"
          value={formatINR(t?.netTaxable)}
          sub={`${t?.invoices ?? 0} invoices · less CN ${formatINR(t?.creditNotes.taxable)}`}
          loading={!data}
        />
        <StatCard label="Output Tax (Net of CN)" value={formatINR(t?.outputTax)} sub={`Credit note tax ${formatINR(t?.creditNotes.totalTax)}`} loading={!data} />
        <StatCard label="Input GST (Purchases)" value={formatINR(t?.inputTax)} sub={`On ${formatINR(data?.inputGst.taxable)} taxable`} loading={!data} />
        <StatCard label="Net GST (Output − Input)" value={formatINR(t?.netTax)} sub="Indicative only" loading={!data} />
        <StatCard
          label="B2B / B2C"
          value={
            <span className="text-base">
              {data?.split.B2B.invoices ?? 0} / {data?.split.B2C.invoices ?? 0} invoices
            </span>
          }
          sub={`B2B ${formatINR(data?.split.B2B.taxable)} · B2C ${formatINR(data?.split.B2C.taxable)}`}
          loading={!data}
          onClick={() => setF({ tab: "invoices" })}
        />
      </StatGrid>

      <div className="mb-3 flex flex-wrap items-center gap-2 overflow-x-auto">
        <Toggle value={tab} onChange={(v) => setF({ tab: v })} options={TABS} />
        {tab === "invoices" && (
          <SimpleSelect
            className="h-8 w-36"
            value={f.type}
            onChange={(type) => setF({ type })}
            clearLabel="B2B and B2C"
            placeholder="B2B and B2C"
            options={[
              { value: "B2B", label: "B2B Only" },
              { value: "B2C", label: "B2C Only" },
            ]}
          />
        )}
      </div>

      <HelpText>
        Active invoices by invoice date, less active credit notes by credit-note date. B2B = customer GSTIN on the invoice.
        Other charges (delivery etc.) appear as their own line in the HSN summary. Input GST is from stock-in entries in
        the period. Check figures with your accountant before filing.
      </HelpText>

      <DataTable
        columns={table.columns}
        rows={table.rows}
        loading={isFetching}
        dense
        emptyText={table.empty}
        footer={table.rows?.length ? <TotalsRow columns={table.columns} values={table.totals} /> : undefined}
      />
    </>
  );
}
