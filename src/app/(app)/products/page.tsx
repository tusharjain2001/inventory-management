"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ImageOff, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { FilterBar, SearchInput } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { Money, Qty, RequirePermission } from "@/components/common/misc";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { useMeta } from "@/hooks/use-meta";
import { api, type Paged } from "@/lib/api-client";
import { formatAmount, label } from "@/lib/format";
import { ImportDialog } from "./import-dialog";
import type { ProductRow } from "./types";

export default function ProductsPage() {
  return (
    <RequirePermission permission="products.view">
      <ProductList />
    </RequirePermission>
  );
}

function ProductList() {
  const router = useRouter();
  const { can } = useSession();
  const { data: meta } = useMeta();
  const [importOpen, setImportOpen] = useState(false);
  const list = useListState({ categoryId: "", subCategoryId: "", status: "", active: "true" }, { field: "name", dir: "asc" });
  const showCost = can("products.viewCost");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["products", list.params],
    queryFn: () => api.get<Paged<ProductRow>>("/api/products", list.params),
    placeholderData: keepPreviousData,
  });

  const subCategories = meta?.categories.find((c) => String(c.id) === list.filters.categoryId)?.subCategories ?? [];

  const columns: Column<ProductRow>[] = [
    {
      key: "image",
      header: "",
      noExport: true,
      className: "w-12",
      cell: (p) =>
        p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="size-9 max-w-none rounded object-cover" />
        ) : (
          <div className="flex size-9 items-center justify-center rounded bg-muted">
            <ImageOff className="size-4 text-muted-foreground" />
          </div>
        ),
    },
    {
      key: "name",
      header: "Product",
      sortable: true,
      cell: (p) => (
        <div className="min-w-40">
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-muted-foreground">{[p.material, p.size, p.colour].filter(Boolean).join(" · ")}</div>
        </div>
      ),
    },
    { key: "sku", header: "SKU", sortable: true, className: "font-mono text-xs" },
    {
      key: "category",
      header: "Category",
      cell: (p) => (
        <span>
          {p.category.name}
          {p.subCategory && <span className="text-muted-foreground"> › {p.subCategory.name}</span>}
        </span>
      ),
      exportValue: (p) => (p.subCategory ? `${p.category.name} › ${p.subCategory.name}` : p.category.name),
    },
    { key: "hsnCode", header: "HSN", exportValue: (p) => p.hsnCode ?? "" },
    { key: "gstRate", header: "GST %", align: "right", cell: (p) => `${p.gstRate}%` },
    {
      key: "sellingPrice",
      header: "Selling Price",
      align: "right",
      sortable: true,
      cell: (p) => <Money value={p.sellingPrice} />,
      exportValue: (p) => p.sellingPrice,
    },
    ...(showCost
      ? ([
          {
            key: "purchasePrice",
            header: "Purchase Price",
            align: "right",
            cell: (p) => <Money value={p.purchasePrice} />,
            exportValue: (p) => p.purchasePrice ?? 0,
          },
        ] as Column<ProductRow>[])
      : []),
    {
      key: "currentStock",
      header: "Stock",
      align: "right",
      sortable: true,
      cell: (p) => (
        <div>
          <Qty value={p.currentStock} />
          {p.onDisplayStock > 0 && <div className="text-[11px] text-violet-700">+{p.onDisplayStock} on display</div>}
        </div>
      ),
      exportValue: (p) => p.currentStock,
    },
    {
      key: "stockStatus",
      header: "Status",
      cell: (p) => (p.isActive ? <StatusBadge status={p.stockStatus} /> : <StatusBadge status="INACTIVE" text="Inactive" />),
      exportValue: (p) => (p.isActive ? label(p.stockStatus) : "Inactive"),
    },
    ...(showCost
      ? ([
          {
            key: "stockValue",
            header: "Stock Value",
            align: "right",
            cell: (p) => <Money value={p.stockValue} />,
            exportValue: (p) => p.stockValue ?? 0,
          },
        ] as Column<ProductRow>[])
      : []),
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<ProductRow>>("/api/products", { ...list.params, page: 1, pageSize: "all" });
    const totalValue = all.data.reduce((s, p) => s + (p.stockValue ?? 0), 0);
    return {
      title: "Product List",
      filename: "products",
      subtitle: [`${all.total} products`],
      columns,
      rows: all.data,
      totals: showCost ? { stockValue: formatAmount(totalValue) } : undefined,
    };
  };

  return (
    <>
      <PageHeader title="Products" description="Product master: details, pricing, GST and stock">
        <ExportMenu getTable={exportTable} />
        <Can permission="products.create">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload /> Import Excel
          </Button>
          <Button asChild>
            <Link href="/products/new">
              <Plus /> Add Product
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Search name, SKU or HSN" />
        <SimpleSelect
          className="h-9 w-44"
          value={list.filters.categoryId}
          onChange={(v) => list.setFilters({ categoryId: v, subCategoryId: "" })}
          clearLabel="All Categories"
          placeholder="All Categories"
          options={(meta?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
        />
        {subCategories.length > 0 && (
          <SimpleSelect
            className="h-9 w-44"
            value={list.filters.subCategoryId}
            onChange={(v) => list.setFilter("subCategoryId", v)}
            clearLabel="All Sub-Categories"
            placeholder="All Sub-Categories"
            options={subCategories.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        )}
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          clearLabel="Any Stock Status"
          placeholder="Any Stock Status"
          options={[
            { value: "IN_STOCK", label: "In Stock" },
            { value: "LOW_STOCK", label: "Low Stock" },
            { value: "OUT_OF_STOCK", label: "Out of Stock" },
            { value: "NEGATIVE", label: "Negative Stock" },
          ]}
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
        rowKey={(p) => p.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(p) => router.push(`/products/${p.id}`)}
        emptyText="No products match these filters"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
