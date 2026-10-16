"use client";

import { PageHeader } from "@/components/common/page-header";
import { RequirePermission } from "@/components/common/misc";
import { RoleForm } from "../role-form";

export default function NewRolePage() {
  return (
    <RequirePermission permission="roles.manage">
      <PageHeader title="Add role" back={{ href: "/admin/roles", label: "Roles & permissions" }} />
      <RoleForm />
    </RequirePermission>
  );
}
