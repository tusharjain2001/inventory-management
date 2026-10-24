"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange, type DateRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { DetailList, Money, Qty, RequirePermission } from "@/components/common/misc";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, type Paged } from "@/lib/api-client";
import { formatAmount, formatDate, formatDateTime, formatINR, formatQty, label } from "@/lib/format";
import type { LossRow } from "../types";

export default function LossesPage() {
  return (
    <RequirePermission permission="inventory.view">
      <LossList />
    </RequirePermission>
  );
}

function Attachment({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline">
      <Paperclip className="size-3.5" /> View
    </a>
  );
}

function LossList() {
  const { can } = useSession();
  const showCost = can("products.viewCost");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [open, setOpen] = useState<LossRow | null>(null);
  const list = useListState({ type: "" }, { field: "date", dir: "desc" });
  const params = { ...list.params, ...range };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["losses", params],
    queryFn: () => api.get<Paged<LossRow>>("/api/inventory/losses", params),
    placeholderData: keepPreviousData,
  });

  const columns: Column<LossRow>[] = [
    { key: "date", header: "Date", sortable: true, cell: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
    { key: "lossNo", header: "Entry No", cell: (r) => <span className="font-medium whitespace-nowrap">{r.lossNo}</span> },
    { key: "type", header: "Type", cell: (r) => <StatusBadge status={r.type} />, exportValue: (r) => label(r.type) },
    {
      key: "product",
      header: "Product",
      cell: (r) => (
        <div className="min-w-40">
          <div>{r.product.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{r.product.sku}</div>
        </div>
      ),
      exportValue: (r) => `${r.product.name} (${r.product.sku})`,
    },
    { key: "quantity", header: "Qty", align: "right", sortable: true, cell: (r) => <Qty value={r.quantity} /> },
    ...(showCost
      ? ([{ key: "value", header: "Value (at Cost)", align: "right", cell: (r) => <Money value={r.value} />, exportValue: (r) => r.value ?? 0 }] as Column<LossRow>[])
      : []),
    { key: "reason", header: "Reason", cell: (r) => <div className="max-w-60 truncate" title={r.reason}>{r.reason}</div> },
    { key: "location", header: "Location", cell: (r) => r.location ?? "—", exportValue: (r) => r.location ?? "" },
    { key: "approvedBy", header: "Approved by", cell: (r) => r.approvedBy?.name ?? "—", exportValue: (r) => r.approvedBy?.name ?? "" },
    { key: "attachment", header: "Photo / Doc", cell: (r) => <Attachment url={r.attachmentUrl} />, exportValue: (r) => (r.attachmentUrl ? "Yes" : "") },
    { key: "createdBy", header: "By", cell: (r) => r.createdBy?.name ?? "—", exportValue: (r) => r.createdBy?.name ?? "" },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<LossRow>>("/api/inventory/losses", { ...params, page: 1, pageSize: "all" });
    return {
      title: "Damaged / Lost Stock",
      filename: "damaged-lost",
      subtitle: [describeRange(range), list.filters.type ? label(list.filters.type) : "Damaged and lost", `${all.total} entries`],
      columns,
      rows: all.data,
      totals: {
        quantity: formatQty(all.data.reduce((s, r) => s + r.quantity, 0)),
        ...(showCost ? { value: formatAmount(all.data.reduce((s, r) => s + (r.value ?? 0), 0)) } : {}),
      },
    };
  };

  return (
    <>
      <PageHeader title="Damaged / Lost" description="Stock written off as damaged or lost">
        <ExportMenu getTable={exportTable} />
        <Can permission="inventory.damageLoss">
          <Button asChild>
            <Link href="/inventory/losses/new">
              <Plus /> Record Damaged / Lost
            </Link>
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Product, SKU or entry no" />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.type}
          onChange={(v) => list.setFilter("type", v)}
          clearLabel="Damaged & Lost"
          placeholder="Damaged & Lost"
          options={[
            { value: "DAMAGED", label: "Damaged" },
            { value: "LOST", label: "Lost" },
          ]}
        />
        <DateRangeFilter
          value={range}
          onChange={(r) => {
            setRange(r);
            list.setPage(1);
          }}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(r) => r.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={setOpen}
        emptyText="No damaged or lost stock recorded"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {open && label(open.type)} {open?.lossNo}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <>
              <DetailList
                items={[
                  { label: "Date", value: formatDate(open.date) },
                  {
                    label: "Product",
                    value: (
                      <Link href={`/products/${open.product.id}`} className="hover:underline">
                        {open.product.name} ({open.product.sku})
                      </Link>
                    ),
                  },
                  { label: "Quantity", value: formatQty(open.quantity) },
                  ...(showCost ? [{ label: "Value (at Avg Cost)", value: `${formatINR(open.value)} (${formatINR(open.unitCost)} each)` }] : []),
                  { label: "Reason", value: open.reason },
                  { label: "Location", value: open.location },
                  { label: "Approved by", value: open.approvedBy?.name },
                  { label: "Recorded by", value: `${open.createdBy?.name ?? "—"}, ${formatDateTime(open.createdAt)}` },
                  { label: "Remarks", value: open.remarks },
                  { label: "Photo / Document", value: <Attachment url={open.attachmentUrl} /> },
                ]}
              />
              {open.attachmentUrl && !open.attachmentUrl.endsWith(".pdf") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={open.attachmentUrl} alt="Attachment" className="max-h-72 w-full rounded-md border object-contain" />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
