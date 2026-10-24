"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock, RequirePermission } from "@/components/common/misc";
import { useMeta } from "@/hooks/use-meta";
import { api } from "@/lib/api-client";
import { OrderForm, type DisplayPrefill } from "../order-form";
import type { CustomerLite } from "../../types";

export default function NewOrderPage() {
  return (
    <RequirePermission permission="sales.create">
      <PageHeader title="New Sale" back={{ href: "/sales/orders", label: "Sales Orders" }} />
      <Suspense fallback={<LoadingBlock rows={6} />}>
        <NewOrder />
      </Suspense>
    </RequirePermission>
  );
}

type DisplayResponse = Omit<DisplayPrefill, "customer"> & { customerId: number | null };

function NewOrder() {
  const sp = useSearchParams();
  const displayId = Number(sp.get("displayId")) || null;
  const { data: meta, error: metaError } = useMeta();
  const disp = useQuery({
    queryKey: ["display", displayId],
    queryFn: () => api.get<DisplayResponse>(`/api/inventory/display/${displayId}`),
    enabled: !!displayId,
  });
  const customerId = disp.data?.customerId ?? null;
  const cust = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => api.get<CustomerLite>(`/api/customers/${customerId}`),
    enabled: !!customerId,
  });

  if (metaError || disp.error) return <ErrorBlock error={metaError ?? disp.error} />;
  if (!meta || (displayId && (disp.isLoading || (customerId && cust.isLoading)))) return <LoadingBlock rows={6} />;

  const display: DisplayPrefill | undefined = disp.data
    ? {
        id: disp.data.id,
        displayNo: disp.data.displayNo,
        customer: cust.data ?? null,
        items: disp.data.items,
      }
    : undefined;

  if (display && !display.items.some((i) => i.outstandingQty > 0)) {
    return <ErrorBlock error={new Error(`Nothing is left on display for ${display.displayNo}.`)} />;
  }

  return <OrderForm key={displayId ?? "new"} meta={meta} display={display} />;
}
