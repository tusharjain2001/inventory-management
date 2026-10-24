"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { FilterBar, SearchInput } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { RequirePermission } from "@/components/common/misc";
import { Can } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, type Paged } from "@/lib/api-client";
import type { SupplierRow } from "./types";

export default function SuppliersPage() {
  return (
    <RequirePermission permission="suppliers.view">
      <SupplierList />
    </RequirePermission>
  );
}

function SupplierList() {
  const router = useRouter();
  const list = useListState({ active: "true" }, { field: "name", dir: "asc" });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["suppliers", list.params],
    queryFn: () => api.get<Paged<SupplierRow>>("/api/suppliers", list.params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<SupplierRow>[] = [
    {
      key: "name",
      header: "Supplier",
      sortable: true,
      cell: (r) => (
        <div className="min-w-40">
          <div className="flex items-center gap-1.5 font-medium">
            {r.name}
            {!r.isActive && <StatusBadge status="INACTIVE" text="Inactive" />}
          </div>
          {r.contactPerson && <div className="text-xs text-muted-foreground">{r.contactPerson}</div>}
        </div>
      ),
    },
    { key: "contactPerson", header: "Contact", cell: (r) => r.contactPerson ?? "—", exportValue: (r) => r.contactPerson ?? "" },
    { key: "phone", header: "Phone", cell: (r) => r.phone ?? "—", exportValue: (r) => r.phone ?? "" },
    { key: "email", header: "Email", cell: (r) => r.email ?? "—", exportValue: (r) => r.email ?? "" },
    { key: "gstin", header: "GSTIN", className: "font-mono text-xs", cell: (r) => r.gstin ?? "—", exportValue: (r) => r.gstin ?? "" },
    {
      key: "city",
      header: "City / State",
      sortable: true,
      cell: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—",
      exportValue: (r) => [r.city, r.state].filter(Boolean).join(", "),
    },
    { key: "stockIns", header: "Stock-Ins", align: "right", cell: (r) => r._count?.stockIns ?? 0, exportValue: (r) => r._count?.stockIns ?? 0 },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<SupplierRow>>("/api/suppliers", { ...list.params, page: 1, pageSize: "all" });
    return { title: "Suppliers", filename: "suppliers", subtitle: [`${all.total} suppliers`], columns, rows: all.data };
  };

  return (
    <>
      <PageHeader title="Suppliers" description="Vendors you buy stock from">
        <ExportMenu getTable={exportTable} />
        <Can permission="suppliers.manage">
          <Button asChild>
            <Link href="/suppliers/new">
              <Plus /> Add Supplier
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Search name, contact, phone or GSTIN" className="sm:w-80" />
        <SimpleSelect
          className="h-9 w-32"
          value={list.filters.active}
          onChange={(v) => list.setFilter("active", v)}
          options={[
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
            { value: "all", label: "All" },
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(r) => r.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(r) => router.push(`/suppliers/${r.id}`)}
        emptyText="No suppliers match these filters"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
