"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorBlock, LoadingBlock, Money, Qty, RequirePermission, StatCard } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { Can, useSession } from "@/components/session-provider";
import { api, errorMessage, type Paged } from "@/lib/api-client";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductForm } from "../product-form";
import type { ProductDetail } from "../types";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission={["products.view", "inventory.view"]}>
      <ProductView id={Number(id)} />
    </RequirePermission>
  );
}

function ProductView({ id }: { id: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { can } = useSession();
  const { data: p, isLoading, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => api.get<ProductDetail>(`/api/products/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !p) return <ErrorBlock error={error} />;

  async function remove() {
    if (!p) return;
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      description: "The product will be hidden from lists. Its sales and stock history stay on record.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/products/${id}`);
      toast.success("Product deleted");
      router.push("/products");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title={p.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.sku}</span>
            <span>·</span>
            <span>
              {p.category.name}
              {p.subCategory ? ` › ${p.subCategory.name}` : ""}
            </span>
            {p.isActive ? <StatusBadge status={p.stockStatus} /> : <StatusBadge status="INACTIVE" text="Inactive" />}
            {p.sourceType === "CONSIGNMENT" && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                Consignment{p.preferredSupplier ? ` · ${p.preferredSupplier.name}` : ""}
              </span>
            )}
          </span>
        }
        back={{ href: "/products", label: "Products" }}
      >
        <Can permission="products.delete">
          <Button variant="destructive" onClick={remove}>
            <Trash2 /> Delete
          </Button>
        </Can>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="In Showroom" value={<Qty value={p.currentStock} />} sub={`Reorder at ${formatQty(p.reorderLevel)}`} />
        <StatCard label="Out on Display" value={<Qty value={p.onDisplayStock} />} sub="Potential sales" />
        {can("products.viewCost") && (
          <StatCard label="Stock Value" value={<Money value={p.stockValue} />} sub={<>Avg Cost <Money value={p.avgCost} /></>} />
        )}
        <StatCard label="Sold (Last 90 Days)" value={<Qty value={p.sales.last90DaysQty} />} sub={<Money value={p.sales.last90DaysValue} />} />
        <StatCard
          label="Last Sale / Purchase"
          value={<span className="text-base">{p.lastSaleAt ? formatDate(p.lastSaleAt) : "No sales yet"}</span>}
          sub={p.lastPurchaseAt ? `Purchased ${formatDate(p.lastPurchaseAt)}` : "No purchases yet"}
        />
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          {can("inventory.view") && <TabsTrigger value="ledger">Stock Movements</TabsTrigger>}
        </TabsList>
        <TabsContent value="details" className="mt-4">
          <ProductForm product={p} />
        </TabsContent>
        {can("inventory.view") && (
          <TabsContent value="ledger" className="mt-4">
            <Ledger productId={p.id} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

type LedgerRow = {
  id: number;
  txnDate: string;
  type: string;
  quantity: number;
  stockEffect: number;
  displayEffect: number;
  balanceAfter: number;
  unitCost?: number;
  refNo: string | null;
  refType: string | null;
  remarks: string | null;
  createdBy: { name: string } | null;
};

const TXN_LABELS: Record<string, string> = {
  OPENING: "Opening Stock",
  STOCK_IN: "Stock In",
  SALE: "Sale",
  SALE_REVERSAL: "Sale Cancelled",
  DISPLAY_OUT: "Out for Display",
  DISPLAY_RETURN: "Back from Display",
  ADJUSTMENT_IN: "Adjustment (+)",
  ADJUSTMENT_OUT: "Adjustment (−)",
  DAMAGED: "Damaged",
  LOST: "Lost",
};

function Ledger({ productId }: { productId: number }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["product-ledger", productId, page],
    queryFn: () => api.get<Paged<LedgerRow>>(`/api/products/${productId}/ledger`, { page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const columns: Column<LedgerRow>[] = [
    { key: "txnDate", header: "Date", cell: (r) => formatDateTime(r.txnDate) },
    { key: "type", header: "Movement", cell: (r) => TXN_LABELS[r.type] ?? r.type },
    { key: "refNo", header: "Reference", cell: (r) => r.refNo ?? "—" },
    {
      key: "stockEffect",
      header: "Change",
      align: "right",
      cell: (r) => (
        <span className={cn("tabular-nums", r.stockEffect > 0 ? "text-emerald-700" : r.stockEffect < 0 ? "text-red-700" : "")}>
          {r.stockEffect > 0 ? "+" : ""}
          {formatQty(r.stockEffect)}
        </span>
      ),
    },
    { key: "balanceAfter", header: "Balance", align: "right", cell: (r) => <Qty value={r.balanceAfter} /> },
    { key: "remarks", header: "Remarks", cell: (r) => <span className="text-muted-foreground">{r.remarks}</span> },
    { key: "createdBy", header: "By", cell: (r) => r.createdBy?.name ?? "—" },
  ];
  return (
    <>
      <DataTable columns={columns} rows={data?.data} loading={isLoading || isFetching} rowKey={(r) => r.id} emptyText="No stock movements yet" dense />
      {data && <Pagination page={page} pageSize={25} total={data.total} onPageChange={setPage} />}
    </>
  );
}
