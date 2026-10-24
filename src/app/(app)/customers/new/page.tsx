"use client";

import { PageHeader } from "@/components/common/page-header";
import { RequirePermission } from "@/components/common/misc";
import { CustomerForm } from "../customer-form";

export default function NewCustomerPage() {
  return (
    <RequirePermission permission="customers.create">
      <PageHeader title="Add Customer" back={{ href: "/customers", label: "Customers" }} />
      <CustomerForm />
    </RequirePermission>
  );
}
