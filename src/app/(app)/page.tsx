"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { DateRangeFilter, describeRange, FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorBlock, RequirePermission, StatCard } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { api, buildUrl } from "@/lib/api-client";
import { formatINR, formatQty, label } from "@/lib/format";
import { todayIST } from "@/lib/dates";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  amt,
  apiParams,
  CategoryFilter,
  CustomerFilter,
  HelpText,
  ProductFilter,
  SalespersonFilter,
  thisMonth,
  Toggle,
  useUrlFilters,
} from "./reports/_components/report-kit";

type Brief = { amount: number; invoices: number; units: number };
type Bucket = { key: string; label: string; from: string; to: string; amount: number; invoices: number; units: number };
type Dashboard = {
  period: { from: string; to: string };
  financials: boolean;
  itemFilter: boolean;
  ownOnly: boolean;
  deadStockDays: number;
  stock: {
    units: number;
    showroomUnits: number;
    displayUnits: number;
    skus: number;
    value: number | null;
    normal: number;
    low: number;
    out: number;
    dead: number;
  };
  today: Brief;
  month: Brief;
  selected: Brief & {
    net: number;
    creditNotes: number;
    amountAfterCredit: number;
    netRevenue: number;
    avgInvoice: number;
    cogs?: number;
    grossProfit?: number;
    marginPct?: number;
  };
  topProducts: { id: number; name: string; sku: string; units: number; amount: number }[];
  categories: { id: number; name: string; units: number; amount: number; net: number }[];
  trend: { daily: Bucket[]; weekly: Bucket[]; monthly: Bucket[]; yearly: Bucket[] };
  paymentStatus: { status: string; count: number; value: number; balance: number }[];
  outstanding: { invoices: number; balance: number; overdueInvoices: number; overdueBalance: number };
};

type TrendTab = "daily" | "weekly" | "monthly" | "yearly";

export default function DashboardPage() {
  return (
    <RequirePermission permission="dashboard.view">
      <Suspense>
        <DashboardView />
      </Suspense>
    </RequirePermission>
  );
}

/** Bordered block with a title and optional link, used for each dashboard table. */
function Panel({ title, href, linkText = "View report", children, className }: { title: string; href?: string; linkText?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            {linkText}
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

function DashboardView() {
  const router = useRouter();
  const { can } = useSession();
  const [f, setF] = useUrlFilters({
    ...thisMonth(),
    categoryId: "",
    subCategoryId: "",
    productId: "",
    productLabel: "",
    customerId: "",
    customerLabel: "",
    salespersonId: "",
    top: "5",
  });
  const [trendTab, setTrendTab] = useState<TrendTab>("daily");
  const params = apiParams(f);
  const { data, isFetching, error } = useQuery({
    queryKey: ["dashboard", params],
    queryFn: () => api.get<Dashboard>("/api/dashboard", params),
    placeholderData: keepPreviousData,
  });

  const loading = !data;
  const s = data?.selected;
  const st = data?.stock;

  /** Report link carrying the current sales filters; null when the user can't open that report. */
  const link = (perm: Permission, path: string, extra: Record<string, string | undefined> = {}) => {
    if (!can(perm)) return null;
    const salesParams =
      perm === "reports.sales" || perm === "reports.profit"
        ? {
            from: f.from,
            to: f.to,
            categoryId: f.categoryId,
            subCategoryId: f.subCategoryId,
            productId: f.productId,
            productLabel: f.productLabel,
            customerId: f.customerId,
            customerLabel: f.customerLabel,
            salespersonId: f.salespersonId,
          }
        : {};
    return buildUrl(path, { ...salesParams, ...extra });
  };
  const go = (href: string | null) => (href ? () => router.push(href) : undefined);

  const today = todayIST();
  const periodLabel = describeRange(f).replace("Period: ", "");

  const topColumns: Column<Dashboard["topProducts"][number]>[] = [
    { key: "rank", header: "#", className: "w-8 text-muted-foreground", cell: (_, i) => i + 1 },
    {
      key: "name",
      header: "Product",
      cell: (r) => (
        <div className="min-w-32">
          <div className="font-medium">{r.name}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{r.sku}</div>
        </div>
      ),
    },
    { key: "units", header: "Units", align: "right", className: "tabular-nums", cell: (r) => formatQty(r.units) },
    { key: "amount", header: "Sales", align: "right", className: "tabular-nums whitespace-nowrap", cell: (r) => amt(r.amount) },
  ];

  const trendColumns: Column<Bucket>[] = [
    { key: "label", header: trendTab === "daily" ? "Day" : trendTab === "weekly" ? "Week" : trendTab === "monthly" ? "Month" : "Financial year", className: "whitespace-nowrap" },
    { key: "invoices", header: "Invoices", align: "right", className: "tabular-nums" },
    { key: "units", header: "Units", align: "right", className: "tabular-nums", cell: (r) => formatQty(r.units) },
    {
      key: "amount",
      header: "Sales",
      align: "right",
      className: "tabular-nums whitespace-nowrap font-medium",
      cell: (r) => (r.amount ? amt(r.amount) : <span className="text-muted-foreground">—</span>),
    },
  ];

  const categoryColumns: Column<Dashboard["categories"][number]>[] = [
    { key: "name", header: "Category", className: "font-medium" },
    { key: "units", header: "Units", align: "right", className: "tabular-nums", cell: (r) => formatQty(r.units) },
    { key: "amount", header: "Sales", align: "right", className: "tabular-nums whitespace-nowrap", cell: (r) => amt(r.amount) },
  ];

  type StockRow = { key: string; status: string; text: string; count: number; href: string | null };
  const stockRows: StockRow[] = st
    ? [
        { key: "normal", status: "IN_STOCK", text: "Normal", count: st.normal, href: link("reports.stock", "/reports/stock") },
        { key: "low", status: "LOW_STOCK", text: "Low stock", count: st.low, href: link("reports.stock", "/reports/low-stock", { level: "low" }) },
        { key: "out", status: "OUT_OF_STOCK", text: "Out of stock", count: st.out, href: link("reports.stock", "/reports/low-stock", { level: "out" }) },
        { key: "dead", status: "DEAD", text: `Dead stock (${data!.deadStockDays}+ days)`, count: st.dead, href: link("reports.valuation", "/reports/dead-stock") },
      ]
    : [];
  const stockColumns: Column<StockRow>[] = [
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} text={r.text} /> },
    { key: "count", header: "Products", align: "right", className: "tabular-nums font-medium" },
  ];

  type PayRow = Dashboard["paymentStatus"][number];
  const payColumns: Column<PayRow>[] = [
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={r.status} text={r.status === "UNPAID" ? "Pending" : label(r.status)} />,
    },
    { key: "count", header: "Invoices", align: "right", className: "tabular-nums" },
    { key: "value", header: "Invoice Value", align: "right", className: "tabular-nums whitespace-nowrap", cell: (r) => amt(r.value) },
    {
      key: "balance",
      header: "Balance Due",
      align: "right",
      className: "tabular-nums whitespace-nowrap font-medium",
      cell: (r) => (r.balance > 0 ? amt(r.balance) : <span className="text-muted-foreground">—</span>),
    },
  ];
  const payLink = (r: PayRow) =>
    r.status === "PAID" || r.status === "REFUNDED"
      ? link("reports.sales", "/reports/sales", { groupBy: "invoice", paymentStatus: r.status })
      : link("reports.payment", "/reports/payments", { tab: "outstanding", bucket: r.status === "OVERDUE" ? undefined : "NOT_DUE" }) ??
        link("reports.sales", "/reports/sales", { groupBy: "invoice", paymentStatus: r.status });

  const trendRows = data?.trend[trendTab];

  return (
    <>
      <PageHeader title="Dashboard" description={data?.ownOnly ? "Your sales and current stock" : "Sales and stock at a glance"} />

      <FilterBar>
        <DateRangeFilter value={f} onChange={(r) => setF(r)} />
        <CategoryFilter categoryId={f.categoryId} subCategoryId={f.subCategoryId} onChange={(v) => setF(v)} />
        <ProductFilter id={f.productId} label={f.productLabel} onChange={(productId, productLabel) => setF({ productId, productLabel })} />
        <CustomerFilter id={f.customerId} label={f.customerLabel} onChange={(customerId, customerLabel) => setF({ customerId, customerLabel })} />
        <SalespersonFilter value={f.salespersonId} onChange={(salespersonId) => setF({ salespersonId })} />
      </FilterBar>

      {error && <ErrorBlock error={error} />}

      {/* Sales KPIs */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={formatINR(data?.today.amount)}
          sub={`${data?.today.invoices ?? 0} invoices · ${formatQty(data?.today.units)} units`}
          loading={loading}
          onClick={go(link("reports.sales", "/reports/sales", { from: today, to: today }))}
        />
        <StatCard
          label="This month"
          value={formatINR(data?.month.amount)}
          sub={`${data?.month.invoices ?? 0} invoices · ${formatQty(data?.month.units)} units`}
          loading={loading}
          onClick={go(link("reports.sales", "/reports/sales", { from: thisMonth().from, to: today }))}
        />
        <StatCard
          label="Selected period"
          value={formatINR(s?.amount)}
          sub={
            <>
              {periodLabel} · Net {formatINR(s?.net)} · {s?.invoices ?? 0} invoices · {formatQty(s?.units)} units
              {!!s?.creditNotes && <> · less credit notes {formatINR(s.creditNotes)}</>}
            </>
          }
          loading={loading}
          onClick={go(link("reports.sales", "/reports/sales"))}
        />
        <StatCard label="Average invoice value" value={formatINR(s?.avgInvoice)} sub="Selected period" loading={loading} />
      </div>

      {/* Stock & money KPIs */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total stock"
          value={`${formatQty(st?.units)} units`}
          sub={`${st?.skus ?? 0} active SKUs · ${formatQty(st?.displayUnits)} on display`}
          loading={loading}
          onClick={go(link("reports.stock", "/reports/stock"))}
        />
        {data?.financials ? (
          <StatCard
            label="Stock value (at cost)"
            value={formatINR(st?.value)}
            sub="Showroom + display × avg cost"
            loading={loading}
            onClick={go(link("reports.valuation", "/reports/valuation"))}
          />
        ) : (
          <StatCard
            label="Out of stock"
            value={st?.out ?? 0}
            sub="Products with no showroom stock"
            loading={loading}
            onClick={go(link("reports.stock", "/reports/low-stock", { level: "out" }))}
          />
        )}
        <StatCard
          label="Low stock items"
          value={st?.low ?? 0}
          sub={`${st?.out ?? 0} out of stock`}
          loading={loading}
          onClick={go(link("reports.stock", "/reports/low-stock"))}
          className={cn(!!st?.low && "border-amber-200")}
        />
        {data?.financials ? (
          <StatCard
            label="Gross profit (selected period)"
            value={formatINR(s?.grossProfit)}
            sub={`Margin ${(s?.marginPct ?? 0).toFixed(1)}% on net revenue ${formatINR(s?.netRevenue)}`}
            loading={loading}
            onClick={go(link("reports.profit", "/reports/profit"))}
          />
        ) : (
          <StatCard
            label="Outstanding (all dates)"
            value={formatINR(data?.outstanding.balance)}
            sub={`${data?.outstanding.overdueInvoices ?? 0} overdue · ${formatINR(data?.outstanding.overdueBalance)}`}
            loading={loading}
            onClick={go(link("reports.payment", "/reports/payments", { tab: "outstanding" }))}
          />
        )}
      </div>
      {data?.financials && (
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Outstanding (all dates)"
            value={formatINR(data.outstanding.balance)}
            sub={`${data.outstanding.invoices} invoices`}
            onClick={go(link("reports.payment", "/reports/payments", { tab: "outstanding" }))}
          />
          <StatCard
            label="Overdue"
            value={formatINR(data.outstanding.overdueBalance)}
            sub={`${data.outstanding.overdueInvoices} invoices past due date`}
            className={cn(data.outstanding.overdueBalance > 0 && "border-red-200")}
            onClick={go(link("reports.payment", "/reports/payments", { tab: "outstanding" }))}
          />
        </div>
      )}

      <HelpText>
        Sales = active invoices by invoice date, including GST (net = excluding GST).
        {data?.itemFilter && " With a product or category filter, amounts are the matching item line totals."} Filters apply to
        sales figures; stock figures are for all active products.
        {data?.ownOnly && " You see only your own sales."}
      </HelpText>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Top-selling products" href={link("reports.sales", "/reports/sales", { groupBy: "product" }) ?? undefined}>
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-muted-foreground">By units sold, selected period</span>
            <SimpleSelect
              className="h-8 w-24"
              value={f.top}
              onChange={(top) => setF({ top })}
              options={["5", "10", "20"].map((n) => ({ value: n, label: `Top ${n}` }))}
            />
          </div>
          <DataTable
            columns={topColumns}
            rows={data?.topProducts}
            loading={isFetching && !data}
            rowKey={(r) => r.id}
            dense
            className="border-0"
            emptyText="No sales in this period"
            onRowClick={
              can("reports.sales")
                ? (r) => router.push(link("reports.sales", "/reports/sales", { groupBy: "line", productId: String(r.id), productLabel: r.name })!)
                : undefined
            }
          />
        </Panel>

        <Panel title="Sales trend" href={link("reports.sales", "/reports/sales", { groupBy: "day" }) ?? undefined}>
          <div className="mb-2 overflow-x-auto px-1">
            <Toggle
              value={trendTab}
              onChange={setTrendTab}
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
          </div>
          <DataTable
            columns={trendColumns}
            rows={trendRows}
            loading={isFetching && !data}
            rowKey={(r) => r.key}
            dense
            className="border-0"
            onRowClick={
              can("reports.sales")
                ? (r) => router.push(link("reports.sales", "/reports/sales", { groupBy: trendTab === "daily" ? "invoice" : "day", from: r.from, to: r.to > today ? today : r.to })!)
                : undefined
            }
          />
        </Panel>

        <Panel title="Sales by category" href={link("reports.sales", "/reports/sales", { groupBy: "product" }) ?? undefined}>
          <DataTable
            columns={categoryColumns}
            rows={data?.categories}
            loading={isFetching && !data}
            rowKey={(r) => r.id}
            dense
            className="border-0"
            emptyText="No sales in this period"
            onRowClick={
              can("reports.sales")
                ? (r) => router.push(link("reports.sales", "/reports/sales", { groupBy: "product", categoryId: String(r.id), subCategoryId: undefined })!)
                : undefined
            }
          />
        </Panel>

        <div className="grid min-w-0 grid-cols-1 gap-4">
          <Panel title="Stock status" href={link("reports.stock", "/reports/low-stock") ?? undefined} linkText="Low stock report">
            <DataTable
              columns={stockColumns}
              rows={data ? stockRows : undefined}
              loading={isFetching && !data}
              rowKey={(r) => r.key}
              dense
              className="border-0"
              onRowClick={(r) => r.href && router.push(r.href)}
            />
          </Panel>

          <Panel title="Payment status" href={link("reports.payment", "/reports/payments", { tab: "outstanding" }) ?? undefined} linkText="Outstanding">
            <p className="px-1 pb-1 text-xs text-muted-foreground">Invoices dated in the selected period. Pending = unpaid, not yet due.</p>
            <DataTable
              columns={payColumns}
              rows={data?.paymentStatus}
              loading={isFetching && !data}
              rowKey={(r) => r.status}
              dense
              className="border-0"
              onRowClick={(r) => {
                const href = payLink(r);
                if (href) router.push(href);
              }}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
