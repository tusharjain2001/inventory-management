"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { RequirePermission } from "@/components/common/misc";
import { useListState } from "@/hooks/use-list-state";
import { useMeta } from "@/hooks/use-meta";
import { api, type Paged } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

type LoginRow = {
  id: number;
  userId: number | null;
  user: { id: number; name: string } | null;
  identifier: string;
  success: boolean;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

/** "Chrome on Windows" from a user-agent string. */
function device(ua: string | null) {
  if (!ua) return "—";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : (ua.split(/[\s/]/)[0] ?? "Unknown");
  return os ? `${browser} on ${os}` : browser;
}

export default function LoginActivityPage() {
  return (
    <RequirePermission permission="audit.view">
      <LoginList />
    </RequirePermission>
  );
}

function LoginList() {
  const { data: meta } = useMeta();
  const list = useListState({ from: "", to: "", success: "", userId: "" }, undefined, 50);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["login-activity", list.params],
    queryFn: () => api.get<Paged<LoginRow>>("/api/login-activity", list.params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<LoginRow>[] = [
    { key: "createdAt", header: "Time", className: "whitespace-nowrap tabular-nums", cell: (r) => formatDateTime(r.createdAt), exportValue: (r) => formatDateTime(r.createdAt) },
    { key: "identifier", header: "Signed in as", cell: (r) => <span className="font-mono text-xs">{r.identifier}</span> },
    { key: "user", header: "User", cell: (r) => r.user?.name ?? <span className="text-muted-foreground">Unknown</span>, exportValue: (r) => r.user?.name ?? "" },
    {
      key: "success",
      header: "Result",
      cell: (r) => <StatusBadge status={r.success ? "SUCCESS" : "FAILED"} />,
      exportValue: (r) => (r.success ? "Success" : "Failed"),
    },
    { key: "reason", header: "Reason", cell: (r) => r.reason ?? "—", exportValue: (r) => r.reason ?? "" },
    { key: "ip", header: "IP", className: "font-mono text-xs", cell: (r) => r.ip ?? "—", exportValue: (r) => r.ip ?? "" },
    {
      key: "device",
      header: "Device",
      cell: (r) => (
        <span title={r.userAgent ?? undefined} className="whitespace-nowrap">
          {device(r.userAgent)}
        </span>
      ),
      exportValue: (r) => device(r.userAgent),
    },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<LoginRow>>("/api/login-activity", { ...list.params, page: 1, pageSize: "all" });
    return {
      title: "Login Activity",
      filename: "login-activity",
      subtitle: [describeRange({ from: list.filters.from, to: list.filters.to }), `${all.total} attempts`],
      columns,
      rows: all.data,
    };
  };

  return (
    <>
      <PageHeader title="Login activity" description="Every sign-in attempt, successful or not">
        <ExportMenu getTable={exportTable} />
      </PageHeader>

      <FilterBar>
        <DateRangeFilter value={{ from: list.filters.from, to: list.filters.to }} onChange={(r) => list.setFilters(r)} />
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Search email/username, IP or reason" className="sm:w-72" />
        <SimpleSelect
          className="h-9 w-36"
          value={list.filters.success}
          onChange={(v) => list.setFilter("success", v)}
          clearLabel="All results"
          placeholder="All results"
          options={[
            { value: "true", label: "Successful" },
            { value: "false", label: "Failed" },
          ]}
        />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.userId}
          onChange={(v) => list.setFilter("userId", v)}
          clearLabel="All users"
          placeholder="All users"
          options={(meta?.users ?? []).map((u) => ({ value: String(u.id), label: u.name }))}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(r) => r.id}
        emptyText="No sign-in attempts match these filters"
        dense
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
