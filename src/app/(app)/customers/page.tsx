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
import { Money, RequirePermission } from "@/components/common/misc";
import { Can } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, type Paged } from "@/lib/api-client";
import { formatAmount, formatDate, label } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CUSTOMER_TYPE_OPTIONS, type CustomerRow } from "./types";

export default function CustomersPage() {
  return (
    <RequirePermission permission="customers.view">
      <CustomerList />
    </RequirePermission>
  );
}

function CustomerList() {
  const router = useRouter();
  const list = useListState({ type: "", active: "true" });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["customers", list.params],
    queryFn: () => api.get<Paged<CustomerRow>>("/api/customers", list.params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<CustomerRow>[] = [
    { key: "code", header: "ID", sortable: true, className: "font-mono text-xs whitespace-nowrap" },
    {
      key: "name",
      header: "Customer",
      sortable: true,
      cell: (c) => (
        <div className="min-w-40">
          <div className="flex items-center gap-1.5 font-medium">
            {c.name}
            {c.isWalkIn && <StatusBadge status="NORMAL" text="Walk-in" />}
            {!c.isActive && <StatusBadge status="INACTIVE" text="Inactive" />}
          </div>
          {c.companyName && <div className="text-xs text-muted-foreground">{c.companyName}</div>}
        </div>
      ),
      exportValue: (c) => (c.companyName ? `${c.name} (${c.companyName})` : c.name),
    },
    { key: "mobile", header: "Mobile", cell: (c) => c.mobile ?? "—", exportValue: (c) => c.mobile ?? "" },
    {
      key: "city",
      header: "City / State",
      sortable: true,
      cell: (c) => [c.city, c.state].filter(Boolean).join(", ") || "—",
      exportValue: (c) => [c.city, c.state].filter(Boolean).join(", "),
    },
    { key: "customerType", header: "Type", cell: (c) => label(c.customerType), exportValue: (c) => label(c.customerType) },
    {
      key: "totalPurchases",
      header: "Total Purchases",
      align: "right",
      cell: (c) => <Money value={c.stats?.totalPurchases} />,
      exportValue: (c) => c.stats?.totalPurchases ?? 0,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      cell: (c) => (
        <Money value={c.stats?.outstanding} className={cn((c.stats?.outstanding ?? 0) > 0.005 && "font-medium text-red-700")} />
      ),
      exportValue: (c) => c.stats?.outstanding ?? 0,
    },
    {
      key: "lastPurchase",
      header: "Last Purchase",
      cell: (c) => (c.stats?.lastPurchaseDate ? formatDate(c.stats.lastPurchaseDate) : "—"),
      exportValue: (c) => formatDate(c.stats?.lastPurchaseDate),
    },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<CustomerRow>>("/api/customers", { ...list.params, page: 1, pageSize: "all" });
    const sum = (f: (c: CustomerRow) => number) => all.data.reduce((s, c) => s + f(c), 0);
    return {
      title: "Customers",
      filename: "customers",
      subtitle: [`${all.total} customers`],
      columns,
      rows: all.data,
      totals: {
        totalPurchases: formatAmount(sum((c) => c.stats?.totalPurchases ?? 0)),
        outstanding: formatAmount(sum((c) => c.stats?.outstanding ?? 0)),
      },
    };
  };

  return (
    <>
      <PageHeader title="Customers" description="Customer master, purchase history and outstanding balances">
        <ExportMenu getTable={exportTable} />
        <Can permission="customers.create">
          <Button asChild>
            <Link href="/customers/new">
              <Plus /> Add Customer
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Search name, mobile, ID, GSTIN or city" className="sm:w-80" />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.type}
          onChange={(v) => list.setFilter("type", v)}
          clearLabel="All Types"
          placeholder="All Types"
          options={CUSTOMER_TYPE_OPTIONS}
        />
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
        rowKey={(c) => c.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
        emptyText="No customers match these filters"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </>
  );
}
