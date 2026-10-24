"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DetailList, ErrorBlock, LoadingBlock, Money, RequirePermission, StatCard } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { Can, useSession } from "@/components/session-provider";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, label } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { CustomerDetail } from "../types";
import { CustomerHistory, type HistoryTab } from "./history-tabs";

const TABS: { key: HistoryTab; label: string; permission: Permission[] }[] = [
  { key: "invoices", label: "Invoices", permission: ["invoices.view", "sales.view"] },
  { key: "payments", label: "Payments", permission: ["payments.view"] },
  { key: "products", label: "Products Purchased", permission: ["sales.view", "invoices.view"] },
  { key: "display", label: "Display", permission: ["inventory.view", "inventory.display"] },
];

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="customers.view">
      <CustomerView id={Number(id)} />
    </RequirePermission>
  );
}

function CustomerView({ id }: { id: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { canAny } = useSession();
  const { data: c, isLoading, error } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.get<CustomerDetail>(`/api/customers/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !c) return <ErrorBlock error={error} />;

  const tabs = TABS.filter((t) => canAny(t.permission));
  const outstanding = c.stats.outstanding;

  async function remove() {
    if (!c) return;
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description: "Only customers without orders, invoices or display entries can be deleted. Otherwise mark them inactive.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/customers/${id}`);
      toast.success("Customer deleted");
      qc.invalidateQueries({ queryKey: ["customers"] });
      router.push("/customers");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const address = (text: string | null) => (text ? <span className="whitespace-pre-line">{text}</span> : null);

  return (
    <>
      <PageHeader
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{c.code}</span>
            <span>·</span>
            <span>{label(c.customerType)}</span>
            {c.companyName && (
              <>
                <span>·</span>
                <span>{c.companyName}</span>
              </>
            )}
            {c.isWalkIn && <StatusBadge status="NORMAL" text="Walk-in" />}
            {!c.isActive && <StatusBadge status="INACTIVE" text="Inactive" />}
          </span>
        }
        back={{ href: "/customers", label: "Customers" }}
      >
        <Can permission="customers.edit">
          <Button variant="outline" asChild>
            <Link href={`/customers/${id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        </Can>
        {!c.isWalkIn && (
          <Can permission="customers.delete">
            <Button variant="destructive" onClick={remove}>
              <Trash2 /> Delete
            </Button>
          </Can>
        )}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total Orders" value={c.stats.totalOrders} sub="Active invoices" />
        <StatCard label="Total Purchases" value={<Money value={c.stats.totalPurchases} />} sub="After credit notes" />
        <StatCard label="Average Order Value" value={<Money value={c.stats.averageOrderValue} />} />
        <StatCard
          label="Last Purchase"
          value={<span className="text-base">{c.stats.lastPurchaseDate ? formatDate(c.stats.lastPurchaseDate) : "No purchases yet"}</span>}
        />
        <StatCard
          label="Outstanding"
          value={<Money value={outstanding} className={cn(outstanding > 0.005 && "text-red-700")} />}
          sub={
            c.openingBalance ? (
              <>
                Incl. opening balance <Money value={c.openingBalance} />
              </>
            ) : c.creditLimit ? (
              <>
                Credit limit <Money value={c.creditLimit} />
              </>
            ) : undefined
          }
          className={cn("col-span-2 lg:col-span-1", outstanding > 0.005 && "border-red-200")}
        />
      </div>

      <section className="mb-5 rounded-lg border bg-card p-4 sm:p-5">
        <h2 className="mb-4 text-sm font-semibold">Details</h2>
        <DetailList
          className="lg:grid-cols-4"
          items={[
            { label: "Mobile", value: c.mobile },
            { label: "Alternate Mobile", value: c.altMobile },
            { label: "Email", value: c.email },
            { label: "GSTIN", value: c.gstin && <span className="font-mono">{c.gstin}</span> },
            { label: "PAN", value: c.pan && <span className="font-mono">{c.pan}</span> },
            { label: "City", value: c.city },
            { label: "State", value: c.state ? `${c.state}${c.stateCode ? ` (${c.stateCode})` : ""}` : null },
            { label: "PIN Code", value: c.pincode },
            { label: "Billing Address", value: address(c.billingAddress) },
            {
              label: "Shipping Address",
              value: c.shippingAddress && c.shippingAddress === c.billingAddress ? "Same as billing" : address(c.shippingAddress),
            },
            { label: "Country", value: c.country },
            { label: "Credit Limit", value: c.creditLimit != null ? <Money value={c.creditLimit} /> : null },
            { label: "Payment Terms", value: c.paymentTermsDays != null ? `${c.paymentTermsDays} days` : null },
            { label: "Opening Balance", value: <Money value={c.openingBalance} /> },
            { label: "Added", value: `${formatDateTime(c.createdAt)}${c.createdBy ? ` by ${c.createdBy.name}` : ""}` },
            { label: "Notes", value: c.notes && <span className="whitespace-pre-line">{c.notes}</span> },
          ]}
        />
      </section>

      {tabs.length > 0 && (
        <Tabs defaultValue={tabs[0].key}>
          <div className="overflow-x-auto">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-3">
              <CustomerHistory customerId={id} tab={t.key} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </>
  );
}
