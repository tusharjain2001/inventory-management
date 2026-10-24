"use client";

import { Fragment, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { RequirePermission } from "@/components/common/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { useListState } from "@/hooks/use-list-state";
import { useMeta } from "@/hooks/use-meta";
import { api, type Paged } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type AuditRow = {
  id: number;
  userId: number | null;
  user: { id: number; name: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
};

const ACTION_TONE: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-sky-50 text-sky-700 border-sky-200",
  SETTINGS: "bg-sky-50 text-sky-700 border-sky-200",
  DELETE: "bg-red-50 text-red-700 border-red-200",
  CANCEL: "bg-red-50 text-red-700 border-red-200",
  APPROVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECT: "bg-red-50 text-red-700 border-red-200",
  OVERRIDE: "bg-amber-50 text-amber-800 border-amber-200",
  PASSWORD: "bg-amber-50 text-amber-800 border-amber-200",
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        ACTION_TONE[action] ?? "border-slate-200 bg-slate-100 text-slate-700",
      )}
    >
      {titleCase(action)}
    </span>
  );
}

export default function AuditPage() {
  return (
    <RequirePermission permission="audit.view">
      <AuditList />
    </RequirePermission>
  );
}

function AuditList() {
  const { data: meta } = useMeta();
  const list = useListState({ from: "", to: "", userId: "", entity: "", action: "" }, undefined, 50);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit-logs", list.params],
    queryFn: () => api.get<Paged<AuditRow>>("/api/audit-logs", list.params),
    placeholderData: keepPreviousData,
  });
  const { data: facets } = useQuery({
    queryKey: ["audit-logs", "facets"],
    queryFn: () => api.get<{ entities: string[]; actions: string[] }>("/api/audit-logs", { facets: "true" }),
    staleTime: 60_000,
  });

  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportColumns: Column<AuditRow>[] = [
    { key: "createdAt", header: "Time", exportValue: (r) => formatDateTime(r.createdAt) },
    { key: "user", header: "User", exportValue: (r) => r.user?.name ?? "System" },
    { key: "action", header: "Action", exportValue: (r) => titleCase(r.action) },
    { key: "entity", header: "Record", exportValue: (r) => (r.entityId ? `${r.entity} #${r.entityId}` : r.entity) },
    { key: "summary", header: "Summary" },
    { key: "ip", header: "IP", exportValue: (r) => r.ip ?? "" },
  ];
  const exportTable = async () => {
    const all = await api.get<Paged<AuditRow>>("/api/audit-logs", { ...list.params, page: 1, pageSize: "all" });
    return {
      title: "Audit Log",
      filename: "audit-log",
      subtitle: [describeRange({ from: list.filters.from, to: list.filters.to }), `${all.total} entries`],
      columns: exportColumns,
      rows: all.data,
    };
  };

  const rows = data?.data;
  const loading = isLoading || isFetching;

  return (
    <>
      <PageHeader title="Audit Log" description="Who changed what, and when">
        <ExportMenu getTable={exportTable} />
      </PageHeader>

      <FilterBar>
        <DateRangeFilter value={{ from: list.filters.from, to: list.filters.to }} onChange={(r) => list.setFilters(r)} />
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Search summary" />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.userId}
          onChange={(v) => list.setFilter("userId", v)}
          clearLabel="All Users"
          placeholder="All Users"
          options={(meta?.users ?? []).map((u) => ({ value: String(u.id), label: u.name }))}
        />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.entity}
          onChange={(v) => list.setFilter("entity", v)}
          clearLabel="All Records"
          placeholder="All Records"
          options={(facets?.entities ?? []).map((e) => ({ value: e, label: e }))}
        />
        <SimpleSelect
          className="h-9 w-36"
          value={list.filters.action}
          onChange={(v) => list.setFilter("action", v)}
          clearLabel="All Actions"
          placeholder="All Actions"
          options={(facets?.actions ?? []).map((a) => ({ value: a, label: titleCase(a) }))}
        />
      </FilterBar>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b text-left text-muted-foreground">
              <th className="h-9 w-8 px-2" />
              <th className="px-2 font-medium whitespace-nowrap">Time</th>
              <th className="px-2 font-medium">User</th>
              <th className="px-2 font-medium">Action</th>
              <th className="px-2 font-medium">Record</th>
              <th className="px-2 font-medium">Summary</th>
              <th className="px-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows?.length &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-2 py-2">
                      <Skeleton className="h-4 w-full max-w-28" />
                    </td>
                  ))}
                </tr>
              ))}
            {rows?.map((r) => {
              const hasDetail = r.before != null || r.after != null;
              const isOpen = open.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr
                    className={cn("border-b last:border-0", hasDetail && "cursor-pointer hover:bg-muted/40", loading && "opacity-60")}
                    onClick={hasDetail ? () => toggle(r.id) : undefined}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {hasDetail && (isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums">{formatDateTime(r.createdAt)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.user?.name ?? <span className="text-muted-foreground">System</span>}</td>
                    <td className="px-2 py-2">
                      <ActionBadge action={r.action} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {r.entity}
                      {r.entityId && <span className="text-muted-foreground"> #{r.entityId}</span>}
                    </td>
                    <td className="min-w-64 px-2 py-2">{r.summary}</td>
                    <td className="px-2 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">{r.ip ?? "—"}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b bg-muted/20">
                      <td />
                      <td colSpan={6} className="px-2 py-3">
                        <ChangeTable before={r.before} after={r.after} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && rows && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  No audit entries match these filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}

function show(v: unknown): string {
  if (v === undefined) return "";
  if (v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return formatDateTime(v);
  if (Array.isArray(v) && v.every((x) => typeof x !== "object" || x === null)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Before / after values side by side, one row per field. */
function ChangeTable({ before, after }: { before: unknown; after: unknown }) {
  const b = asRecord(before);
  const a = asRecord(after);
  if ((before != null && !b) || (after != null && !a)) {
    return <pre className="overflow-x-auto text-xs whitespace-pre-wrap">{JSON.stringify({ before, after }, null, 2)}</pre>;
  }
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  if (!keys.length) return <p className="text-xs text-muted-foreground">No field details recorded.</p>;
  const both = !!b && !!a;
  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-4xl text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="w-48 py-1 pr-3 font-medium">Field</th>
            {b && <th className="py-1 pr-3 font-medium">{both ? "Before" : "Value"}</th>}
            {a && <th className="py-1 pr-3 font-medium">{both ? "After" : "Value"}</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const changed = both && JSON.stringify(b[key]) !== JSON.stringify(a[key]);
            return (
              <tr key={key} className="border-t align-top">
                <td className="py-1 pr-3 font-mono text-muted-foreground">{key}</td>
                {b && (
                  <td className={cn("py-1 pr-3 break-words whitespace-pre-wrap", changed && "text-red-700 line-through decoration-red-300")}>
                    {show(b[key])}
                  </td>
                )}
                {a && <td className={cn("py-1 pr-3 break-words whitespace-pre-wrap", changed && "font-medium text-emerald-700")}>{show(a[key])}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
