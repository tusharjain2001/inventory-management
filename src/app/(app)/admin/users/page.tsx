"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LockOpen, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { Pagination } from "@/components/common/pagination";
import { FilterBar, SearchInput } from "@/components/common/filters";
import { SimpleSelect } from "@/components/common/simple-select";
import { StatusBadge } from "@/components/common/status-badge";
import { RequirePermission } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { Can, useSession } from "@/components/session-provider";
import { useListState } from "@/hooks/use-list-state";
import { api, errorMessage, type Paged } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { ResetPasswordDialog, UserDialog, type RoleOption, type UserRow } from "./user-dialogs";

export default function UsersPage() {
  return (
    <RequirePermission permission="users.view">
      <UserList />
    </RequirePermission>
  );
}

function UserList() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { user: me, can } = useSession();
  const canManage = can("users.manage");
  const canDelete = can("users.delete");
  const list = useListState({ roleId: "", active: "all" }, { field: "name", dir: "asc" });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["users", list.params],
    queryFn: () => api.get<Paged<UserRow>>("/api/users", list.params),
    placeholderData: keepPreviousData,
  });
  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<Paged<RoleOption>>("/api/roles"),
  });
  const roleOptions = roles?.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  async function unlock(u: UserRow) {
    try {
      await api.post(`/api/users/${u.id}/unlock`);
      toast.success(`${u.name} unlocked`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(u: UserRow) {
    const ok = await confirm({
      title: `Delete ${u.name}?`,
      description: "Users with any activity on record cannot be deleted; deactivate them instead.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/users/${u.id}`);
      toast.success("User deleted");
      refresh();
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      cell: (u) => (
        <div className="min-w-36">
          <div className="font-medium">
            {u.name}
            {u.id === me.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
          </div>
          {u.phone && <div className="text-xs text-muted-foreground">{u.phone}</div>}
        </div>
      ),
    },
    { key: "email", header: "Email", sortable: true },
    { key: "username", header: "Username", cell: (u) => u.username ?? "—" },
    { key: "role", header: "Role", cell: (u) => u.role.name },
    {
      key: "status",
      header: "Status",
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
          {u.isLocked && <StatusBadge status="LOCKED" text={`Locked till ${formatDateTime(u.lockedUntil).slice(-8)}`} />}
        </div>
      ),
    },
    { key: "lastLoginAt", header: "Last Sign-In", sortable: true, cell: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never") },
    ...(canManage || canDelete
      ? ([
          {
            key: "actions",
            header: "",
            noExport: true,
            className: "w-10",
            cell: (u) => (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Actions" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canManage && (
                    <>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(u);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      {u.id !== me.id && (
                        <DropdownMenuItem onSelect={() => setResetFor(u)}>
                          <KeyRound /> Reset Password
                        </DropdownMenuItem>
                      )}
                      {(u.isLocked || u.failedLoginCount > 0) && (
                        <DropdownMenuItem onSelect={() => unlock(u)}>
                          <LockOpen /> Unlock
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  {canDelete && u.id !== me.id && (
                    <>
                      {canManage && <DropdownMenuSeparator />}
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(u)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ] as Column<UserRow>[])
      : []),
  ];

  return (
    <>
      <PageHeader title="Users" description="Who can sign in, and with which role">
        <Can permission="users.manage">
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Add User
          </Button>
        </Can>
      </PageHeader>

      <FilterBar>
        <SearchInput value={list.q} onChange={list.setQ} placeholder="Search name, email, username or phone" className="sm:w-80" />
        <SimpleSelect
          className="h-9 w-40"
          value={list.filters.roleId}
          onChange={(v) => list.setFilter("roleId", v)}
          clearLabel="All Roles"
          placeholder="All Roles"
          options={roleOptions.map((r) => ({ value: String(r.id), label: r.name }))}
        />
        <SimpleSelect
          className="h-9 w-32"
          value={list.filters.active}
          onChange={(v) => list.setFilter("active", v)}
          options={[
            { value: "all", label: "All" },
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading || isFetching}
        rowKey={(u) => u.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={
          canManage
            ? (u) => {
                setEditing(u);
                setDialogOpen(true);
              }
            : undefined
        }
        emptyText="No users match these filters"
      />
      {data && (
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}

      {canManage && (
        <>
          <UserDialog open={dialogOpen} onOpenChange={setDialogOpen} user={editing} roles={roleOptions} />
          <ResetPasswordDialog user={resetFor} onOpenChange={(o) => !o && setResetFor(null)} />
        </>
      )}
    </>
  );
}
