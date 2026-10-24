"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { DataTable, type Column, type SortState } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { StatusBadge } from "@/components/common/status-badge";
import { RequirePermission, StatCard } from "@/components/common/misc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMeta } from "@/hooks/use-meta";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDate } from "@/lib/format";
import {
  CategoryFilter,
  categoryName,
  HelpText,
  qty,
  qtyCol,
  ReportHeader,
  StatGrid,
  subtitle,
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
  unitsSold: number;
  days: number;
  velocity: number;
  currentStock: number;
  onDisplayStock: number;
  daysOfStock: number | null;
  class: "FAST" | "NORMAL" | "SLOW";
};
type Data = {
  rows: Row[];
  totals: { products: number; fast: number; normal: number; slow: number; unitsSold: number; currentStock: number };
  meta: { days: number; fast: number; slow: number; from: string; to: string };
};

const CLASS_LABEL: Record<string, string> = { FAST: "Fast", NORMAL: "Normal", SLOW: "Slow" };

export default function MovementPage() {
  return (
    <RequirePermission permission="reports.stock">
      <Suspense>
        <MovementReport />
      </Suspense>
    </RequirePermission>
  );
}

/** Number box that applies its value after the user stops typing. Remount (key) to reset it. */
function NumberSetting({ id, label: text, value, onChange, step }: { id: string; label: string; value: string; onChange: (v: string) => void; step: string }) {
  const [v, setV] = useState(value);
  const debounced = useDebounced(v, 500);
  useEffect(() => {
    if (debounced !== value && (debounced === "" || Number(debounced) >= 0)) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={id} className="text-xs whitespace-nowrap text-muted-foreground">
        {text}
      </Label>
      <Input id={id} type="number" min={0} step={step} className="h-9 w-20" value={v} onChange={(e) => setV(e.target.value)} />
    </div>
  );
}

function MovementReport() {
  const { data: meta } = useMeta();
  const [f, setF] = useUrlFilters({ days: "", fast: "", slow: "", class: "", categoryId: "", subCategoryId: "" });
  const [sort, setSort] = useState<SortState>(undefined);
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));
  const { data, isFetching, error } = useReport<Data>("movement", params);
  const rows = useSorted(data?.rows, sort);
  const t = data?.totals;
  const m = data?.meta;

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
    qtyCol("unitsSold", "Units Sold"),
    { key: "days", header: "Days", align: "right", className: "tabular-nums" },
    {
      key: "velocity",
      header: "Units / Day",
      align: "right",
      sortable: true,
      className: "tabular-nums",
      cell: (r) => r.velocity.toFixed(2),
      exportValue: (r) => r.velocity,
    },
    qtyCol("currentStock", "Current Stock"),
    {
      key: "daysOfStock",
      header: "Days of Stock",
      align: "right",
      sortable: true,
      className: "tabular-nums",
      cell: (r) => (r.daysOfStock === null ? "—" : r.daysOfStock.toLocaleString("en-IN")),
      exportValue: (r) => r.daysOfStock ?? "",
    },
    {
      key: "class",
      header: "Class",
      sortable: true,
      cell: (r) => <StatusBadge status={r.class} text={CLASS_LABEL[r.class]} />,
      exportValue: (r) => CLASS_LABEL[r.class],
    },
  ];

  const totalValues: Record<string, string> = t
    ? { name: `${t.products} products`, unitsSold: qty(t.unitsSold), currentStock: qty(t.currentStock) }
    : {};

  return (
    <>
      <ReportHeader
        title="Fast / Slow Moving Items"
        description="How quickly each product sells"
        getTable={() => ({
          title: "Fast / Slow Moving Items",
          filename: "fast-slow-moving",
          subtitle: subtitle(null, [
            m && `Period: last ${m.days} days (${formatDate(`${m.from}T12:00:00+05:30`)} to ${formatDate(`${m.to}T12:00:00+05:30`)})`,
            m && `Fast ≥ ${m.fast} units/day, slow ≤ ${m.slow} units/day`,
            f.class && `Class: ${CLASS_LABEL[f.class]}`,
            f.categoryId && `Category: ${categoryName(meta, f.categoryId) ?? f.categoryId}`,
          ]),
          columns,
          rows: rows ?? [],
          totals: totalValues,
        })}
      />

      <FilterBar>
        <NumberSetting key={`days-${f.days || m?.days}`} id="days" label="Days" step="1" value={f.days || String(m?.days ?? "")} onChange={(days) => setF({ days })} />
        <NumberSetting key={`fast-${f.fast || m?.fast}`} id="fast" label="Fast ≥" step="0.01" value={f.fast || String(m?.fast ?? "")} onChange={(fast) => setF({ fast })} />
        <NumberSetting key={`slow-${f.slow || m?.slow}`} id="slow" label="Slow ≤" step="0.01" value={f.slow || String(m?.slow ?? "")} onChange={(slow) => setF({ slow })} />
        <SimpleSelect
          className="h-9 w-full sm:w-36"
          value={f.class}
          onChange={(c) => setF({ class: c })}
          clearLabel="All Classes"
          placeholder="All Classes"
          options={["FAST", "NORMAL", "SLOW"].map((c) => ({ value: c, label: CLASS_LABEL[c] }))}
        />
        <CategoryFilter categoryId={f.categoryId} subCategoryId={f.subCategoryId} onChange={(v) => setF(v)} />
      </FilterBar>

      {error && <p className="mb-3 text-sm text-destructive">{(error as Error).message}</p>}

      <StatGrid>
        <StatCard label="Fast Moving" value={t?.fast ?? 0} loading={!data} onClick={() => setF({ class: "FAST" })} />
        <StatCard label="Normal" value={t?.normal ?? 0} loading={!data} onClick={() => setF({ class: "NORMAL" })} />
        <StatCard label="Slow Moving" value={t?.slow ?? 0} sub="Includes items with no sales" loading={!data} onClick={() => setF({ class: "SLOW" })} />
        <StatCard label="Units Sold" value={qty(t?.unitsSold)} sub={m ? `Last ${m.days} days` : undefined} loading={!data} />
      </StatGrid>

      <HelpText>
        Velocity = units sold on active invoices in the last {m?.days ?? "N"} days ÷ {m?.days ?? "N"}. Fast = at least{" "}
        {m?.fast ?? "—"} units/day; slow = at most {m?.slow ?? "—"} units/day (including no sales). Days of stock = current
        showroom stock ÷ velocity. Defaults come from Settings → Analysis.
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
