"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorBlock, LoadingBlock, RequirePermission } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { api, errorMessage } from "@/lib/api-client";
import { RoleForm, type RoleDetail } from "../role-form";

export default function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="roles.manage">
      <RoleView id={Number(id)} />
    </RequirePermission>
  );
}

function RoleView({ id }: { id: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: role, isLoading, error } = useQuery({
    queryKey: ["role", id],
    queryFn: () => api.get<RoleDetail>(`/api/roles/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !role) return <ErrorBlock error={error} />;

  async function remove() {
    if (!role) return;
    if (!(await confirm({ title: `Delete the ${role.name} role?`, confirmText: "Delete", destructive: true }))) return;
    try {
      await api.delete(`/api/roles/${id}`);
      toast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ["roles"] });
      router.push("/admin/roles");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const users = role.users ?? [];

  return (
    <>
      <PageHeader
        title={role.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {role.isSystem && <StatusBadge status="NORMAL" text="Built-in" />}
            <span>
              {role.userCount} user{role.userCount === 1 ? "" : "s"}
              {users.length > 0 && `: ${users.slice(0, 6).map((u) => u.name).join(", ")}${users.length > 6 ? "…" : ""}`}
            </span>
          </span>
        }
        back={{ href: "/admin/roles", label: "Roles & Permissions" }}
      >
        {!role.isSystem && (
          <Button variant="destructive" onClick={remove} disabled={role.userCount > 0} title={role.userCount > 0 ? "Move its users to another role first" : undefined}>
            <Trash2 /> Delete
          </Button>
        )}
      </PageHeader>
      {/* Remount when the saved role changes so the form shows the stored values. */}
      <RoleForm key={JSON.stringify([role.name, role.permissions, role.maxDiscountPercent])} role={role} />
    </>
  );
}
