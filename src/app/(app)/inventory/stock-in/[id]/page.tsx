"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { DetailList, ErrorBlock, LoadingBlock, Money, Qty, RequirePermission } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api-client";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import type { StockInDetail } from "../../types";

export default function StockInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission={["inventory.stockIn", "purchases.view"]}>
      <StockInView id={Number(id)} />
    </RequirePermission>
  );
}

type Item = StockInDetail["items"][number];

function StockInView({ id }: { id: number }) {
  const { canAny } = useSession();
  const showCost = canAny(["products.viewCost", "purchases.view"]);
  const { data: s, isLoading, error } = useQuery({
    queryKey: ["stock-in", id],
    queryFn: () => api.get<StockInDetail>(`/api/inventory/stock-in/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !s) return <ErrorBlock error={error} />;

  const columns: Column<Item>[] = [
    { key: "sn", header: "#", cell: (_, i) => i + 1, className: "w-8 text-muted-foreground" },
    {
      key: "product",
      header: "Product",
      cell: (i) => (
        <Link href={`/products/${i.productId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          <div className="font-medium">{i.product.name}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {i.product.sku}
            {i.product.hsnCode && ` · HSN ${i.product.hsnCode}`}
          </div>
        </Link>
      ),
    },
    { key: "batchNo", header: "Batch", cell: (i) => i.batchNo ?? "—" },
    { key: "quantity", header: "Qty", align: "right", cell: (i) => <Qty value={i.quantity} /> },
    ...(showCost
      ? ([
          { key: "unitCost", header: "Unit Cost", align: "right", cell: (i) => <Money value={i.unitCost} /> },
          { key: "discountAmount", header: "Discount", align: "right", cell: (i) => (i.discountAmount ? <Money value={i.discountAmount} /> : "—") },
          { key: "taxableValue", header: "Taxable", align: "right", cell: (i) => <Money value={i.taxableValue} /> },
          {
            key: "gst",
            header: "GST",
            align: "right",
            cell: (i) => (
              <div className="whitespace-nowrap">
                <Money value={i.gstAmount} />
                <div className="text-xs text-muted-foreground">{i.gstRate}%</div>
              </div>
            ),
          },
          { key: "totalCost", header: "Total", align: "right", cell: (i) => <Money value={i.totalCost} className="font-medium" /> },
        ] as Column<Item>[])
      : [{ key: "gstRate", header: "GST %", align: "right", cell: (i: Item) => `${i.gstRate}%` } as Column<Item>]),
  ];

  return (
    <>
      <PageHeader
        title={s.stockInNo}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={s.source} />
            <span>{formatDate(s.date)}</span>
          </span>
        }
        back={{ href: "/inventory/stock-in", label: "Stock In / Purchases" }}
      />

      <div className="mb-5 rounded-lg border bg-card p-4">
        <DetailList
          className="lg:grid-cols-3"
          items={[
            { label: "Supplier", value: s.supplier ? `${s.supplier.name}${s.supplier.gstin ? ` (GSTIN ${s.supplier.gstin})` : ""}` : null },
            { label: "Purchase Invoice", value: s.purchaseInvoiceNo ? `${s.purchaseInvoiceNo}${s.purchaseInvoiceDate ? ` dated ${formatDate(s.purchaseInvoiceDate)}` : ""}` : null },
            { label: "Recorded by", value: s.createdBy ? `${s.createdBy.name}, ${formatDateTime(s.createdAt)}` : formatDateTime(s.createdAt) },
            { label: "Remarks", value: s.remarks },
          ]}
        />
      </div>

      <DataTable
        columns={columns}
        rows={s.items}
        rowKey={(i) => i.id}
        footer={
          showCost ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-2.5">
                <div className="ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm tabular-nums">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="text-right">{formatINR(s.subtotal)}</span>
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-right">−{formatINR(s.discountTotal)}</span>
                  <span className="text-muted-foreground">Taxable Value</span>
                  <span className="text-right">{formatINR(s.taxableTotal)}</span>
                  <span className="text-muted-foreground">GST</span>
                  <span className="text-right">{formatINR(s.gstTotal)}</span>
                  <span className="font-semibold">Total</span>
                  <span className="text-right font-semibold">{formatINR(s.total)}</span>
                </div>
              </td>
            </tr>
          ) : undefined
        }
      />

      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        Stock-ins cannot be edited or deleted. To correct a quantity, record a stock adjustment.
      </p>
    </>
  );
}
