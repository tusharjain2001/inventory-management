"use client";

import { PageHeader } from "@/components/common/page-header";
import { RequirePermission } from "@/components/common/misc";
import { SupplierForm } from "../supplier-form";

export default function NewSupplierPage() {
  return (
    <RequirePermission permission="suppliers.manage">
      <PageHeader title="Add Supplier" back={{ href: "/suppliers", label: "Suppliers" }} />
      <SupplierForm />
    </RequirePermission>
  );
}
