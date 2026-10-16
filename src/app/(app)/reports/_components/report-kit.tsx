"use client";

// Building blocks shared by the report pages and the dashboard: URL-synced filters,
// filter controls, client-side sorting, totals rows and the report header with export.

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ExportMenu } from "@/components/common/export-menu";
import { EntityPicker } from "@/components/common/entity-picker";
import { SimpleSelect } from "@/components/common/simple-select";
import { describeRange, type DateRange } from "@/components/common/filters";
import type { Column, SortState } from "@/components/common/data-table";
import { useSession } from "@/components/session-provider";
import { useMeta } from "@/hooks/use-meta";
import { api } from "@/lib/api-client";
import type { ExportTable } from "@/lib/export";
import { formatAmount, formatDate, formatQty } from "@/lib/format";
import { monthStartIST, todayIST } from "@/lib/dates";
import { cn } from "@/lib/utils";

// ───────────── Data ─────────────

type Params = Record<string, string | number | boolean | undefined>;

/** Fetches /api/reports/<name> with the given params. */
export function useReport<T>(name: string, params: Params, enabled = true) {
  return useQuery({
    queryKey: ["report", name, params],
    queryFn: () => api.get<T>(`/api/reports/${name}`, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

// ───────────── URL-synced filters ─────────────

export const thisMonth = (): DateRange => ({ from: monthStartIST(), to: todayIST() });

/**
 * Filter state that starts from the URL query string and writes changes back to it,
 * so report links (e.g. from the dashboard) open with the right filters.
 */
export function useUrlFilters<F extends Record<string, string>>(defaults: F) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<F>(() => {
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof F & string)[]) {
      const v = sp.get(k);
      if (v !== null) out[k] = v as F[typeof k];
    }
    return out;
  });

  function set(patch: Partial<F>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v !== defaults[k]) qs.set(k, v);
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  return [filters, set] as const;
}

/** API params for a date range: from/to, or all=1 when both are cleared. */
export function periodParams(r: { from: string; to: string }): Params {
  return !r.from && !r.to ? { all: "1" } : { from: r.from || undefined, to: r.to || undefined };
}

/** Removes UI-only keys (labels for pickers) before calling the API. */
export function apiParams(f: Record<string, string>, drop: string[] = []): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === "from" || k === "to" || drop.includes(k) || k.endsWith("Label")) continue;
    if (v !== "") out[k] = v;
  }
  return { ...out, ...periodParams({ from: f.from ?? "", to: f.to ?? "" }) };
}

// ───────────── Sorting ─────────────

/** Sorts rows on the client (reports return all rows). */
export function useSorted<T>(rows: T[] | undefined, sort: SortState) {
  return useMemo(() => {
    if (!rows || !sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = (a as Record<string, unknown>)[sort.field];
      const y = (b as Record<string, unknown>)[sort.field];
      if (x === y) return 0;
      if (x === null || x === undefined || x === "") return 1;
      if (y === null || y === undefined || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), "en-IN", { numeric: true }) * dir;
    });
  }, [rows, sort]);
}

// ───────────── Columns ─────────────

export const amt = (n: number | null | undefined) => formatAmount(n);
export const qty = (n: number | null | undefined) => formatQty(n);

export function moneyCol<T>(key: string, header: string, opts: Partial<Column<T>> = {}): Column<T> {
  return {
    key,
    header,
    align: "right",
    sortable: true,
    className: "tabular-nums whitespace-nowrap",
    cell: (r) => amt((r as Record<string, number>)[key]),
    exportValue: (r) => (r as Record<string, number>)[key] ?? 0,
    ...opts,
  };
}

export function qtyCol<T>(key: string, header: string, opts: Partial<Column<T>> = {}): Column<T> {
  return {
    key,
    header,
    align: "right",
    sortable: true,
    className: "tabular-nums",
    cell: (r) => qty((r as Record<string, number>)[key]),
    exportValue: (r) => (r as Record<string, number>)[key] ?? 0,
    ...opts,
  };
}

export function dateCol<T>(key: string, header: string, opts: Partial<Column<T>> = {}): Column<T> {
  return {
    key,
    header,
    sortable: true,
    className: "whitespace-nowrap",
    cell: (r) => formatDate((r as Record<string, string>)[key]),
    exportValue: (r) => formatDate((r as Record<string, string>)[key]),
    ...opts,
  };
}

/** Totals row for DataTable's footer. `values` maps column key → content. */
export function TotalsRow<T>({ columns, values, label = "Total" }: { columns: Column<T>[]; values: Record<string, React.ReactNode>; label?: string }) {
  return (
    <tr>
      {columns.map((c, i) => (
        <td
          key={c.key}
          className={cn(
            "px-3 py-2.5 whitespace-nowrap tabular-nums",
            c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
          )}
        >
          {values[c.key] ?? (i === 0 ? label : "")}
        </td>
      ))}
    </tr>
  );
}

// ───────────── Layout ─────────────

/** Page header with a back link to the reports index and the export menu (if allowed). */
export function ReportHeader<T>({
  title,
  description,
  getTable,
  children,
  back = { href: "/reports", label: "Reports" },
}: {
  title: string;
  description?: React.ReactNode;
  getTable?: () => Promise<ExportTable<T>> | ExportTable<T>;
  children?: React.ReactNode;
  back?: { href: string; label: string } | null;
}) {
  const { can } = useSession();
  return (
    <PageHeader title={title} description={description} back={back ?? undefined}>
      {children}
      {getTable && can("reports.export") && <ExportMenu getTable={getTable} />}
    </PageHeader>
  );
}

/** Small explanatory text about how figures are calculated. */
export function HelpText({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mb-3 flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Info className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5", className)}>{children}</div>;
}

/** Export subtitle lines: period + active filters. */
export function subtitle(range: DateRange | null, filters: unknown[] = []) {
  return [...(range ? [describeRange(range)] : []), ...filters.filter((f): f is string => typeof f === "string" && f !== "")];
}

// ───────────── Filter controls ─────────────

export function CategoryFilter({
  categoryId,
  subCategoryId,
  onChange,
  showSub = true,
}: {
  categoryId: string;
  subCategoryId?: string;
  onChange: (v: { categoryId: string; subCategoryId: string }) => void;
  showSub?: boolean;
}) {
  const { data: meta } = useMeta();
  const subs = meta?.categories.find((c) => String(c.id) === categoryId)?.subCategories ?? [];
  return (
    <>
      <SimpleSelect
        className="h-9 w-full sm:w-44"
        value={categoryId}
        onChange={(v) => onChange({ categoryId: v, subCategoryId: "" })}
        clearLabel="All categories"
        placeholder="All categories"
        options={(meta?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
      />
      {showSub && subs.length > 0 && (
        <SimpleSelect
          className="h-9 w-full sm:w-44"
          value={subCategoryId ?? ""}
          onChange={(v) => onChange({ categoryId, subCategoryId: v })}
          clearLabel="All sub-categories"
          placeholder="All sub-categories"
          options={subs.map((s) => ({ value: String(s.id), label: s.name }))}
        />
      )}
    </>
  );
}

export function categoryName(meta: ReturnType<typeof useMeta>["data"], id: string) {
  return meta?.categories.find((c) => String(c.id) === id)?.name;
}

type CustomerOpt = { id: number; name: string; mobile: string | null; code: string };
type ProductOpt = { id: number; name: string; sku: string };

export function CustomerFilter({ id, label, onChange }: { id: string; label: string; onChange: (id: string, label: string) => void }) {
  return (
    <EntityPicker<CustomerOpt>
      className="w-full sm:w-52"
      endpoint="/api/customers"
      value={id ? Number(id) : null}
      selectedLabel={label || undefined}
      placeholder="All customers"
      searchPlaceholder="Search customers…"
      toOption={(c) => ({ value: c.id, label: c.name, sub: [c.code, c.mobile].filter(Boolean).join(" · "), raw: c })}
      onChange={(o) => onChange(o ? String(o.value) : "", o?.label ?? "")}
    />
  );
}

export function ProductFilter({ id, label, onChange }: { id: string; label: string; onChange: (id: string, label: string) => void }) {
  return (
    <EntityPicker<ProductOpt>
      className="w-full sm:w-56"
      endpoint="/api/products"
      params={{ active: "all" }}
      value={id ? Number(id) : null}
      selectedLabel={label || undefined}
      placeholder="All products"
      searchPlaceholder="Search name or SKU…"
      toOption={(p) => ({ value: p.id, label: p.name, sub: p.sku, raw: p })}
      onChange={(o) => onChange(o ? String(o.value) : "", o?.label ?? "")}
    />
  );
}

/** Salesperson select; hidden for users who can only see their own sales. */
export function SalespersonFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { can } = useSession();
  const { data: meta } = useMeta();
  if (!can("sales.viewAll")) return null;
  return (
    <SimpleSelect
      className="h-9 w-full sm:w-44"
      value={value}
      onChange={onChange}
      clearLabel="All salespeople"
      placeholder="All salespeople"
      options={(meta?.users ?? []).map((u) => ({ value: String(u.id), label: u.name }))}
    />
  );
}

export function SupplierFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: meta } = useMeta();
  return (
    <SimpleSelect
      className="h-9 w-full sm:w-44"
      value={value}
      onChange={onChange}
      clearLabel="All suppliers"
      placeholder="All suppliers"
      options={(meta?.suppliers ?? []).map((s) => ({ value: String(s.id), label: s.name }))}
    />
  );
}

export function userName(meta: ReturnType<typeof useMeta>["data"], id: string) {
  return meta?.users.find((u) => String(u.id) === id)?.name;
}

export function supplierName(meta: ReturnType<typeof useMeta>["data"], id: string) {
  return meta?.suppliers.find((s) => String(s.id) === id)?.name;
}

/** Segmented toggle (e.g. group by). */
export function Toggle<V extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap rounded-lg bg-muted p-[3px] text-sm", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-2.5 font-medium whitespace-nowrap text-muted-foreground transition-colors",
            value === o.value ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
