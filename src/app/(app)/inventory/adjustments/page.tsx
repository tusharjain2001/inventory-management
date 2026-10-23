"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange, type DateRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { DetailList, Qty, RequirePermission } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { useConfirm } from "@/components/common/confirm";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, errorMessage, type Paged } from "@/lib/api-client";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ADJUSTMENT_REASONS } from "../constants";
import type { AdjustmentRow } from "../types";

export default function AdjustmentsPage() {
  return (
    <RequirePermission permission="inventory.view">
      <AdjustmentList />
    </RequirePermission>
  );
}

const signed = (r: AdjustmentRow) => `${r.type === "INCREASE" ? "+" : "−"}${formatQty(r.quantity)}`;
const STATUS_TEXT = { PENDING: "Pending approval", APPROVED: "Approved", REJECTED: "Rejected" } as const;

function AdjustmentList() {
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [open, setOpen] = useState<AdjustmentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const canApprove = can("inventory.approve");
  const list = useListState({ type: "", reason: "", status: "" }, { field: "date", dir: "desc" });
  const params = { ...list.params, ...range };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["adjustments", params],
    queryFn: () => api.get<Paged<AdjustmentRow> & { pendingCount: number }>("/api/inventory/adjustments", params),
    placeholderData: keepPreviousData,
  });

  async function decide(row: AdjustmentRow, action: "approve" | "reject") {
    let payload: { reason: string } | undefined;
    if (action === "reject") {
      const reason = await confirm({
        title: `Reject adjustment ${row.adjustmentNo}?`,
        description: "Stock will not change. The person who requested it can see the reason.",
        confirmText: "Reject",
        destructive: true,
        reason: { label: "Reason", placeholder: "Why is this adjustment rejected?" },
      });
      if (!reason) return;
      payload = { reason };
    }
    setBusy(true);
    try {
      await api.post(`/api/inventory/adjustments/${row.id}/${action}`, payload);
      toast.success(`Adjustment ${row.adjustmentNo} ${action === "approve" ? "approved; stock updated" : "rejected"}`);
      for (const k of ["adjustments", "products", "product", "inventory-summary", "inventory-ledger"]) qc.invalidateQueries({ queryKey: [k] });
      setOpen(null);
    } catch (err) {
      toast.error(errorMessage(err), { duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<AdjustmentRow>[] = [
    { key: "date", header: "Date", sortable: true, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span>, exportValue: (r) => formatDate(r.date) },
    { key: "adjustmentNo", header: "Adjustment No", cell: (r) => <span className="font-medium whitespace-nowrap">{r.adjustmentNo}</span> },
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
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={r.status} text={STATUS_TEXT[r.status]} />,
      exportValue: (r) => STATUS_TEXT[r.status],
    },
    {
      key: "existingStock",
      header: "Before",
      align: "right",
      cell: (r) => (r.status === "APPROVED" ? <Qty value={r.existingStock} /> : <span className="text-muted-foreground">—</span>),
      exportValue: (r) => (r.status === "APPROVED" ? r.existingStock : ""),
    },
    {
      key: "quantity",
      header: "Change",
      align: "right",
      cell: (r) => <span className={cn("font-medium tabular-nums", r.type === "INCREASE" ? "text-emerald-700" : "text-red-700")}>{signed(r)}</span>,
      exportValue: (r) => (r.type === "INCREASE" ? r.quantity : -r.quantity),
    },
    {
      key: "newStock",
      header: "After",
      align: "right",
      cell: (r) => (r.status === "APPROVED" ? <Qty value={r.newStock} /> : <span className="text-muted-foreground">—</span>),
      exportValue: (r) => (r.status === "APPROVED" ? r.newStock : ""),
    },
    {
      key: "reason",
      header: "Reason",
      cell: (r) => (
        <div className="max-w-60">
          <div>{r.reason}</div>
          {r.remarks && <div className="truncate text-xs text-muted-foreground" title={r.remarks}>{r.remarks}</div>}
        </div>
      ),
      exportValue: (r) => (r.remarks ? `${r.reason}: ${r.remarks}` : r.reason),
    },
    { key: "approvedBy", header: "Approved / rejected by", cell: (r) => r.approvedBy?.name ?? "—", exportValue: (r) => r.approvedBy?.name ?? "" },
    { key: "createdBy", header: "By", cell: (r) => r.createdBy?.name ?? "—", exportValue: (r) => r.createdBy?.name ?? "" },
  ];

  const exportTable = async () => {
    const all = await api.get<Paged<AdjustmentRow>>("/api/inventory/adjustments", { ...params, page: 1, pageSize: "all" });
    return { title: "Stock Adjustments", filename: "stock-adjustments", subtitle: [describeRange(range), `${all.total} adjustments`], columns, rows: all.data };
  };

  return (
    <>
      <PageHeader title="Stock Adjustments" description="Corrections to showroom stock. Requests from staff change stock only after a manager approves.">
        <ExportMenu getTable={exportTable} />
        <Can permission="inventory.adjust">
          <Button asChild>
            <Link href="/inventory/adjustments/new">
              <Plus /> New adjustment
            </Link>
          </Button>
        </Can>
      </PageHeader>

      {canApprove && !!data?.pendingCount && list.filters.status !== "PENDING" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Clock className="size-4 shrink-0" />
          <span className="flex-1">
            {data.pendingCount} adjustment{data.pendingCount === 1 ? " is" : "s are"} waiting for your approval.
          </span>
          <Button size="sm" variant="outline" onClick={() => list.setFilter("status", "PENDING")}>
            Show pending
          </Button>
        </div>
      )}

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Product, SKU or adjustment no" />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          clearLabel="All statuses"
          placeholder="All statuses"
          options={(["PENDING", "APPROVED", "REJECTED"] as const).map((v) => ({ value: v, label: STATUS_TEXT[v] }))}
        />
        <SimpleSelect
          className="h-9 w-36"
          value={list.filters.type}
          onChange={(v) => list.setFilter("type", v)}
          clearLabel="Increase & decrease"
          placeholder="Increase & decrease"
          options={[
            { value: "INCREASE", label: "Increase" },
            { value: "DECREASE", label: "Decrease" },
          ]}
        />
        <SimpleSelect
          className="h-9 w-52"
          value={list.filters.reason}
          onChange={(v) => list.setFilter("reason", v)}
          clearLabel="All reasons"
          placeholder="All reasons"
          options={ADJUSTMENT_REASONS.map((r) => ({ value: r, label: r }))}
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
        emptyText="No adjustments found"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adjustment {open?.adjustmentNo}</DialogTitle>
          </DialogHeader>
          {open && (
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
                { label: "Status", value: <StatusBadge status={open.status} text={STATUS_TEXT[open.status]} /> },
                { label: "Change", value: signed(open) },
                {
                  label: "Stock",
                  value:
                    open.status === "APPROVED"
                      ? `${formatQty(open.existingStock)} → ${formatQty(open.newStock)}`
                      : open.status === "PENDING"
                        ? "Not changed yet (changes when approved)"
                        : "Not changed",
                },
                { label: "Reason", value: open.reason },
                { label: "Remarks", value: open.remarks },
                { label: "Requested by", value: `${open.createdBy?.name ?? "—"}, ${formatDateTime(open.createdAt)}` },
                {
                  label: open.status === "REJECTED" ? "Rejected by" : "Approved by",
                  value: open.approvedBy ? `${open.approvedBy.name}${open.approvedAt ? `, ${formatDateTime(open.approvedAt)}` : ""}` : undefined,
                },
                { label: "Rejection reason", value: open.rejectionReason },
              ]}
            />
          )}
          {open?.status === "PENDING" && canApprove && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" disabled={busy} onClick={() => decide(open, "reject")}>
                <X /> Reject
              </Button>
              <Button disabled={busy} onClick={() => decide(open, "approve")}>
                <Check /> Approve
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
