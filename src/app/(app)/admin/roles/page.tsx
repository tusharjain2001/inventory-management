"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { RequirePermission } from "@/components/common/misc";
import { api, type Paged } from "@/lib/api-client";
import { formatPercent } from "@/lib/format";
import { ADMIN_ROLE_KEY, ALL_PERMISSIONS } from "@/lib/permissions";
import type { RoleDetail } from "./role-form";

type RoleRow = RoleDetail & { activeUserCount: number };

export default function RolesPage() {
  return (
    <RequirePermission permission="roles.manage">
      <RoleList />
    </RequirePermission>
  );
}

function RoleList() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<Paged<RoleRow>>("/api/roles"),
  });

  const columns: Column<RoleRow>[] = [
    {
      key: "name",
      header: "Role",
      cell: (r) => (
        <div className="min-w-40">
          <div className="flex items-center gap-1.5 font-medium">
            {r.name}
            {r.isSystem && <StatusBadge status="NORMAL" text="Built-in" />}
          </div>
          {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
        </div>
      ),
    },
    {
      key: "permissions",
      header: "Permissions",
      cell: (r) => (r.key === ADMIN_ROLE_KEY ? "All" : `${r.permissions.length} of ${ALL_PERMISSIONS.length}`),
    },
    { key: "maxDiscountPercent", header: "Max discount", align: "right", cell: (r) => formatPercent(r.maxDiscountPercent) },
    {
      key: "users",
      header: "Users",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums">
          {r.activeUserCount}
          {r.userCount > r.activeUserCount && <span className="text-muted-foreground"> (+{r.userCount - r.activeUserCount} inactive)</span>}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Roles & permissions" description="What each role can see and do, and its discount limit">
        <Button asChild>
          <Link href="/admin/roles/new">
            <Plus /> Add role
          </Link>
        </Button>
      </PageHeader>
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/roles/${r.id}`)}
        emptyText="No roles"
      />
    </>
  );
}
