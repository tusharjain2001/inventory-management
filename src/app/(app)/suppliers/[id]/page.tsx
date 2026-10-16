"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorBlock, LoadingBlock, Money, RequirePermission, StatCard } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { Can, useSession } from "@/components/session-provider";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { SupplierForm } from "../supplier-form";
import type { SupplierDetail } from "../types";

export default function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="suppliers.view">
      <SupplierView id={Number(id)} />
    </RequirePermission>
  );
}

type StockInRow = SupplierDetail["recentStockIns"][number];

function SupplierView({ id }: { id: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { canAny } = useSession();
  const { data: s, isLoading, error } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => api.get<SupplierDetail>(`/api/suppliers/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !s) return <ErrorBlock error={error} />;

  const showValues = canAny(["purchases.view", "products.viewCost", "inventory.stockIn"]);

  async function remove() {
    if (!s) return;
    const ok = await confirm({
      title: `Delete ${s.name}?`,
      description: "Only suppliers without stock-in records can be deleted. Otherwise mark them inactive.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/suppliers/${id}`);
      toast.success("Supplier deleted");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
      router.push("/suppliers");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const columns: Column<StockInRow>[] = [
    {
      key: "stockInNo",
      header: "Stock-in",
      cell: (r) => (
        <Link href={`/inventory/stock-in/${r.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.stockInNo}
        </Link>
      ),
    },
    { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
    { key: "purchaseInvoiceNo", header: "Supplier invoice", cell: (r) => r.purchaseInvoiceNo ?? "—" },
    { key: "items", header: "Items", align: "right", cell: (r) => r._count.items },
    ...(showValues ? ([{ key: "total", header: "Total", align: "right", cell: (r) => <Money value={r.total} /> }] as Column<StockInRow>[]) : []),
  ];

  return (
    <>
      <PageHeader
        title={s.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {s.gstin && <span className="font-mono">{s.gstin}</span>}
            {[s.city, s.state].filter(Boolean).length > 0 && <span>{[s.city, s.state].filter(Boolean).join(", ")}</span>}
            {!s.isActive && <StatusBadge status="INACTIVE" text="Inactive" />}
          </span>
        }
        back={{ href: "/suppliers", label: "Suppliers" }}
      >
        <Can permission="suppliers.manage">
          <Button variant="destructive" onClick={remove}>
            <Trash2 /> Delete
          </Button>
        </Can>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stock-ins" value={s.stats.purchases} />
        {showValues && <StatCard label="Purchase value" value={<Money value={s.stats.purchaseValue} />} sub="All stock-ins incl. GST" />}
        <StatCard
          label="Last purchase"
          value={<span className="text-base">{s.stats.lastPurchaseDate ? formatDate(s.stats.lastPurchaseDate) : "None yet"}</span>}
        />
        <StatCard label="Preferred supplier for" value={s.stats.preferredForProducts} sub="products" />
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="stockins">Recent stock-ins ({s.recentStockIns.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-4">
          <SupplierForm key={s.updatedAt} supplier={s} />
        </TabsContent>
        <TabsContent value="stockins" className="mt-4">
          <DataTable
            columns={columns}
            rows={s.recentStockIns}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/inventory/stock-in/${r.id}`)}
            emptyText="No stock-ins from this supplier yet"
            dense
          />
          {s.stats.purchases > s.recentStockIns.length && (
            <p className="mt-2 text-xs text-muted-foreground">Showing the latest {s.recentStockIns.length} of {s.stats.purchases}.</p>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
