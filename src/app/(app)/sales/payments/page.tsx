"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { DateRangeFilter, FilterBar, SearchInput, describeRange } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { ExportMenu } from "@/components/common/export-menu";
import { Money, RequirePermission, StatCard } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, errorMessage, type Paged } from "@/lib/api-client";
import { formatAmount, formatDate, label } from "@/lib/format";
import { PaymentDialog } from "../_components/payment-dialog";
import { PAYMENT_MODE_OPTIONS, type PaymentRow } from "../types";

type PaymentsResponse = Paged<PaymentRow> & { sums: { receipts: number; refunds: number } };

export default function PaymentsPage() {
  return (
    <RequirePermission permission="payments.view">
      <PaymentList />
    </RequirePermission>
  );
}

function PaymentList() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [dialog, setDialog] = useState<{ payment?: PaymentRow } | null>(null);
  const list = useListState({ mode: "", type: "", from: "", to: "" }, { field: "paymentDate", dir: "desc" });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["payments", list.params],
    queryFn: () => api.get<PaymentsResponse>("/api/payments", list.params),
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoice"] });
  };

  async function remove(p: PaymentRow) {
    const ok = await confirm({
      title: `Delete ${p.paymentNo}?`,
      description: "The invoice balance will be recalculated.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/payments/${p.id}`);
      toast.success("Payment deleted");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const columns: Column<PaymentRow>[] = [
    { key: "paymentNo", header: "No.", sortable: true, className: "font-medium whitespace-nowrap" },
    { key: "paymentDate", header: "Date", sortable: true, cell: (p) => formatDate(p.paymentDate), exportValue: (p) => formatDate(p.paymentDate) },
    {
      key: "invoice",
      header: "Invoice",
      cell: (p) => (
        <Link href={`/sales/invoices/${p.invoiceId}`} className="whitespace-nowrap hover:underline">
          {p.invoice?.invoiceNo}
        </Link>
      ),
      exportValue: (p) => p.invoice?.invoiceNo ?? "",
    },
    { key: "customer", header: "Customer", cell: (p) => p.invoice?.order.customerName, exportValue: (p) => p.invoice?.order.customerName ?? "" },
    {
      key: "type",
      header: "Type",
      cell: (p) => <span className={p.type === "REFUND" ? "text-red-700" : undefined}>{label(p.type)}</span>,
      exportValue: (p) => label(p.type),
    },
    { key: "mode", header: "Mode", cell: (p) => label(p.mode), exportValue: (p) => label(p.mode) },
    { key: "reference", header: "Reference", cell: (p) => p.reference ?? "—", exportValue: (p) => p.reference ?? "" },
    { key: "receivedBy", header: "Received by", cell: (p) => p.receivedBy?.name ?? "—", exportValue: (p) => p.receivedBy?.name ?? "" },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      cell: (p) => <Money value={p.type === "REFUND" ? -p.amount : p.amount} className="font-medium" />,
      exportValue: (p) => (p.type === "REFUND" ? -p.amount : p.amount),
    },
    ...(can("payments.edit")
      ? ([
          {
            key: "actions",
            header: "",
            noExport: true,
            align: "right",
            cell: (p) => (
              <span className="whitespace-nowrap">
                <Button variant="ghost" size="icon-sm" onClick={() => setDialog({ payment: p })} aria-label="Edit">
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(p)} aria-label="Delete">
                  <Trash2 />
                </Button>
              </span>
            ),
          },
        ] as Column<PaymentRow>[])
      : []),
  ];

  const exportTable = async () => {
    const all = await api.get<PaymentsResponse>("/api/payments", { ...list.params, page: 1, pageSize: "all" });
    return {
      title: "Payments",
      filename: "payments",
      subtitle: [
        describeRange(list.filters),
        list.filters.mode ? `Mode: ${label(list.filters.mode)}` : "All modes",
        `Receipts ${formatAmount(all.sums.receipts)} · Refunds ${formatAmount(all.sums.refunds)}`,
      ],
      columns,
      rows: all.data,
      totals: { amount: formatAmount(all.sums.receipts - all.sums.refunds) },
    };
  };

  return (
    <>
      <PageHeader title="Payments" description="Receipts and refunds against invoices">
        <ExportMenu getTable={exportTable} />
        <Can permission="payments.record">
          <Button onClick={() => setDialog({})}>
            <Plus /> Record payment
          </Button>
        </Can>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Receipts" value={<Money value={data?.sums.receipts ?? 0} />} loading={isLoading} />
        <StatCard label="Refunds" value={<Money value={data?.sums.refunds ?? 0} />} loading={isLoading} />
        <StatCard label="Net received" value={<Money value={(data?.sums.receipts ?? 0) - (data?.sums.refunds ?? 0)} />} loading={isLoading} />
      </div>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Payment no., invoice, customer, ref." />
        <SimpleSelect
          className="h-9 w-36"
          value={list.filters.mode}
          onChange={(v) => list.setFilter("mode", v)}
          clearLabel="All modes"
          placeholder="All modes"
          options={PAYMENT_MODE_OPTIONS}
        />
        <SimpleSelect
          className="h-9 w-36"
          value={list.filters.type}
          onChange={(v) => list.setFilter("type", v)}
          clearLabel="Receipts + refunds"
          placeholder="Receipts + refunds"
          options={[
            { value: "RECEIPT", label: "Receipts" },
            { value: "REFUND", label: "Refunds" },
          ]}
        />
        <DateRangeFilter value={{ from: list.filters.from, to: list.filters.to }} onChange={(r) => list.setFilters(r)} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(p) => p.id}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyText="No payments match these filters"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}

      <PaymentDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} payment={dialog?.payment} onSaved={refresh} />
    </>
  );
}
