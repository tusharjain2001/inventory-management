"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { DateRangeFilter, FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { StatusBadge } from "@/components/common/status-badge";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { formatINR, label } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  useSorted,
  useUrlFilters,
} from "../_components/report-kit";

type PaymentRow = {
  id: number;
  paymentNo: string;
  type: "RECEIPT" | "REFUND";
  paymentDate: string;
  invoiceId: number;
  invoiceNo: string;
  customer: string;
  mode: string;
  reference: string;
  amount: number;
  net: number;
  receivedBy: string;
};
type ModeRow = { mode: string; count: number; received: number; refunded: number; net: number };
type OutRow = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  customer: string;
  phone: string;
  salesperson: string;
  grandTotal: number;
  amountPaid: number;
  creditNoteTotal: number;
  balanceDue: number;
  overdueDays: number;
  bucket: string;
};
type Data = {
  rows: PaymentRow[];
  byMode: ModeRow[];
  totals: { payments: number; received: number; refunded: number; net: number };
  outstanding: {
    rows: OutRow[];
    ageing: { key: string; label: string; invoices: number; balance: number }[];
    totals: { invoices: number; grandTotal: number; amountPaid: number; creditNoteTotal: number; balanceDue: number; overdue: number };
  };
};

const MODES = ["CASH", "UPI", "BANK_TRANSFER", "NEFT", "RTGS", "IMPS", "CREDIT_CARD", "DEBIT_CARD", "CHEQUE", "OTHER"];
type Tab = "payments" | "modes" | "outstanding";

export default function PaymentReportPage() {
  return (
    <RequirePermission permission="reports.payment">
      <Suspense>
        <PaymentReport />
      </Suspense>
    </RequirePermission>
  );
}

function PaymentReport() {
  const [f, setF] = useUrlFilters({ ...thisMonth(), tab: "payments", customerId: "", customerLabel: "", mode: "", type: "", bucket: "" });
  const [sort, setSort] = useState<SortState>(undefined);
  const tab = f.tab as Tab;
  const { data, isFetching } = useReport<Data>("payments", apiParams(f, ["tab", "bucket"]));
  const payments = useSorted(data?.rows, tab === "payments" ? sort : undefined);
  const outAll = (data?.outstanding.rows ?? []).filter((r) => !f.bucket || r.bucket === f.bucket);
  const outstanding = useSorted(data ? outAll : undefined, tab === "outstanding" ? sort : undefined);
  const t = data?.totals;
  const o = data?.outstanding.totals;

  const paymentColumns: Column<PaymentRow>[] = [
    dateCol("paymentDate", "Date"),
    { key: "paymentNo", header: "Payment No", sortable: true, className: "font-medium whitespace-nowrap" },
    {
      key: "type",
      header: "Type",
      sortable: true,
      cell: (r) => <StatusBadge status={r.type === "REFUND" ? "REFUNDED" : "PAID"} text={label(r.type)} />,
      exportValue: (r) => label(r.type),
    },
    {
      key: "invoiceNo",
      header: "Invoice No",
      sortable: true,
      cell: (r) => (
        <Link href={`/sales/invoices/${r.invoiceId}`} className="whitespace-nowrap hover:underline">
          {r.invoiceNo}
        </Link>
      ),
      exportValue: (r) => r.invoiceNo,
    },
    { key: "customer", header: "Customer", sortable: true },
    { key: "mode", header: "Mode", sortable: true, cell: (r) => label(r.mode), exportValue: (r) => label(r.mode) },
    { key: "reference", header: "Reference" },
    moneyCol("net", "Amount", {
      cell: (r) => <span className={cn("font-medium", r.net < 0 && "text-destructive")}>{amt(r.net)}</span>,
    }),
    { key: "receivedBy", header: "Received By", sortable: true },
  ];

  const modeColumns: Column<ModeRow>[] = [
    { key: "mode", header: "Mode", sortable: true, className: "font-medium", cell: (r) => label(r.mode), exportValue: (r) => label(r.mode) },
    { key: "count", header: "Payments", align: "right", sortable: true, className: "tabular-nums" },
    moneyCol("received", "Received"),
    moneyCol("refunded", "Refunded"),
    moneyCol("net", "Net", { className: "tabular-nums whitespace-nowrap font-medium" }),
  ];

  const outColumns: Column<OutRow>[] = [
    {
      key: "invoiceNo",
      header: "Invoice No",
      sortable: true,
      cell: (r) => (
        <Link href={`/sales/invoices/${r.id}`} className="font-medium whitespace-nowrap hover:underline">
          {r.invoiceNo}
        </Link>
      ),
      exportValue: (r) => r.invoiceNo,
    },
    dateCol("invoiceDate", "Date"),
    dateCol("dueDate", "Due Date"),
    {
      key: "customer",
      header: "Customer",
      sortable: true,
      cell: (r) => (
        <div>
          <div>{r.customer}</div>
          {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
        </div>
      ),
      exportValue: (r) => r.customer,
    },
    { key: "salesperson", header: "Salesperson", sortable: true },
    moneyCol("grandTotal", "Invoice Total"),
    moneyCol("amountPaid", "Paid"),
    moneyCol("creditNoteTotal", "Credit Notes"),
    moneyCol("balanceDue", "Balance Due", { className: "tabular-nums whitespace-nowrap font-medium" }),
    {
      key: "overdueDays",
      header: "Days Overdue",
      align: "right",
      sortable: true,
      className: "tabular-nums",
      cell: (r) => (r.overdueDays > 0 ? <span className="text-destructive">{r.overdueDays}</span> : "—"),
      exportValue: (r) => r.overdueDays,
    },
    {
      key: "bucket",
      header: "Ageing",
      sortable: true,
      cell: (r) => <StatusBadge status={r.bucket === "NOT_DUE" ? "UNPAID" : "OVERDUE"} text={bucketLabel(data, r.bucket)} />,
      exportValue: (r) => bucketLabel(data, r.bucket),
    },
  ];

  const paymentTotals: Record<string, string> = t ? { net: amt(t.net) } : {};
  const modeTotals: Record<string, string> = t
    ? { count: String(t.payments), received: amt(t.received), refunded: amt(t.refunded), net: amt(t.net) }
    : {};
  const sumOut = (k: keyof OutRow) => amt(outAll.reduce((s, r) => s + (r[k] as number), 0));
  const outTotals: Record<string, string> = data
    ? { grandTotal: sumOut("grandTotal"), amountPaid: sumOut("amountPaid"), creditNoteTotal: sumOut("creditNoteTotal"), balanceDue: sumOut("balanceDue") }
    : {};

  const filterLines = [
    f.customerId && `Customer: ${f.customerLabel || f.customerId}`,
    f.mode && `Mode: ${label(f.mode)}`,
    f.type && `Type: ${label(f.type)}`,
  ];
  const getTable = (): ExportTable<unknown> =>
    (tab === "outstanding"
      ? {
          title: "Outstanding Invoices",
          filename: "outstanding",
          subtitle: subtitle(null, [
            "As of today",
            f.customerId && `Customer: ${f.customerLabel || f.customerId}`,
            f.bucket && `Ageing: ${bucketLabel(data, f.bucket)}`,
          ]),
          columns: outColumns,
          rows: outstanding ?? [],
          totals: outTotals,
        }
      : tab === "modes"
        ? { title: "Payments by Mode", filename: "payments-by-mode", subtitle: subtitle(f, filterLines), columns: modeColumns, rows: data?.byMode ?? [], totals: modeTotals }
        : {
            title: "Payment Report",
            filename: "payments",
            subtitle: subtitle(f, filterLines),
            columns: paymentColumns,
            rows: payments ?? [],
            totals: paymentTotals,
          }) as ExportTable<unknown>;

  return (
    <>
      <ReportHeader title="Payment Report" description="Money received and refunded, and what customers still owe" getTable={getTable} />

      <div className="mb-3 overflow-x-auto">
        <Toggle
          value={tab}
          onChange={(v) => {
            setSort(undefined);
            setF({ tab: v });
          }}
          options={[
            { value: "payments", label: "Payments" },
            { value: "modes", label: "By Mode" },
            { value: "outstanding", label: "Outstanding" },
          ]}
        />
      </div>

      <FilterBar>
        {tab !== "outstanding" && <DateRangeFilter value={f} onChange={(r) => setF(r)} />}
        <CustomerFilter id={f.customerId} label={f.customerLabel} onChange={(customerId, customerLabel) => setF({ customerId, customerLabel })} />
        {tab !== "outstanding" ? (
          <>
            <SimpleSelect
              className="h-9 w-full sm:w-40"
              value={f.mode}
              onChange={(mode) => setF({ mode })}
              clearLabel="All Modes"
              placeholder="All Modes"
              options={MODES.map((m) => ({ value: m, label: label(m) }))}
            />
            <SimpleSelect
              className="h-9 w-full sm:w-44"
              value={f.type}
              onChange={(type) => setF({ type })}
              clearLabel="Receipts & Refunds"
              placeholder="Receipts & Refunds"
              options={[
                { value: "RECEIPT", label: "Receipts Only" },
                { value: "REFUND", label: "Refunds Only" },
              ]}
            />
          </>
        ) : (
          <SimpleSelect
            className="h-9 w-full sm:w-40"
            value={f.bucket}
            onChange={(bucket) => setF({ bucket })}
            clearLabel="All Ageing"
            placeholder="All Ageing"
            options={(data?.outstanding.ageing ?? []).map((a) => ({ value: a.key, label: a.label }))}
          />
        )}
      </FilterBar>

      {tab === "outstanding" ? (
        <>
          <StatGrid>
            <StatCard label="Total Outstanding" value={formatINR(o?.balanceDue)} sub={`${o?.invoices ?? 0} invoices`} loading={!data} />
            {(data?.outstanding.ageing ?? []).map((a) => (
              <StatCard
                key={a.key}
                label={a.key === "NOT_DUE" ? "Not yet due" : `Overdue ${a.label}`}
                value={formatINR(a.balance)}
                sub={`${a.invoices} invoices`}
                onClick={() => setF({ bucket: f.bucket === a.key ? "" : a.key })}
                className={cn(f.bucket === a.key && "ring-2 ring-primary/40")}
              />
            ))}
          </StatGrid>
          <HelpText>Active invoices with a balance due, as of today. Days overdue count from the due date.</HelpText>
          <DataTable
            columns={outColumns}
            rows={outstanding}
            loading={isFetching}
            rowKey={(r) => r.id}
            sort={sort}
            onSortChange={setSort}
            dense
            emptyText="Nothing outstanding"
            footer={outAll.length ? <TotalsRow columns={outColumns} values={outTotals} /> : undefined}
          />
        </>
      ) : (
        <>
          <StatGrid>
            <StatCard label="Received" value={formatINR(t?.received)} loading={!data} />
            <StatCard label="Refunded" value={formatINR(t?.refunded)} loading={!data} />
            <StatCard label="Net Collected" value={formatINR(t?.net)} sub={`${t?.payments ?? 0} payments`} loading={!data} />
            {(data?.byMode ?? []).slice(0, 2).map((m) => (
              <StatCard key={m.mode} label={label(m.mode)} value={formatINR(m.net)} sub={`${m.count} payments`} />
            ))}
          </StatGrid>
          <HelpText>Payments by payment date. Refunds are shown as negative amounts.</HelpText>
          {tab === "modes" ? (
            <DataTable
              columns={modeColumns}
              rows={data?.byMode}
              loading={isFetching}
              rowKey={(r) => r.mode}
              dense
              emptyText="No payments in this period"
              footer={data?.byMode.length ? <TotalsRow columns={modeColumns} values={modeTotals} /> : undefined}
            />
          ) : (
            <DataTable
              columns={paymentColumns}
              rows={payments}
              loading={isFetching}
              rowKey={(r) => r.id}
              sort={sort}
              onSortChange={setSort}
              dense
              emptyText="No payments in this period"
              footer={payments?.length ? <TotalsRow columns={paymentColumns} values={paymentTotals} /> : undefined}
            />
          )}
        </>
      )}
    </>
  );
}

function bucketLabel(data: Data | undefined, key: string) {
  return data?.outstanding.ageing.find((a) => a.key === key)?.label ?? key;
}
