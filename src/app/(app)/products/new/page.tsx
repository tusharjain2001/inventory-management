"use client";

import { PageHeader } from "@/components/common/page-header";
import { RequirePermission } from "@/components/common/misc";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  return (
    <RequirePermission permission="products.create">
      <PageHeader title="Add product" back={{ href: "/products", label: "Products" }} />
      <ProductForm />
    </RequirePermission>
  );
}
