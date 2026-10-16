"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock, RequirePermission } from "@/components/common/misc";
import { api } from "@/lib/api-client";
import { CustomerForm } from "../../customer-form";
import type { CustomerDetail } from "../../types";

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="customers.edit">
      <EditCustomer id={Number(id)} />
    </RequirePermission>
  );
}

function EditCustomer({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.get<CustomerDetail>(`/api/customers/${id}`),
  });
  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !data) return <ErrorBlock error={error} />;
  return (
    <>
      <PageHeader title={`Edit ${data.name}`} description={data.code} back={{ href: `/customers/${id}`, label: data.name }} />
      <CustomerForm customer={data} />
    </>
  );
}
