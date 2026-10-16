"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { ADMIN_ROLE_KEY, ALL_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";

export type RoleDetail = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  maxDiscountPercent: number;
  isSystem: boolean;
  userCount: number;
  users?: { id: number; name: string; email: string; isActive: boolean }[];
};

export function RoleForm({ role }: { role?: RoleDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = !!role;
  const isAdmin = role?.key === ADMIN_ROLE_KEY;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [maxDiscount, setMaxDiscount] = useState(role ? String(role.maxDiscountPercent) : "0");
  const [perms, setPerms] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);

  const toggle = (key: string, on: boolean) =>
    setPerms((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const toggleGroup = (keys: readonly string[], on: boolean) =>
    setPerms((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = { name, description, maxDiscountPercent: maxDiscount || 0, permissions: [...perms] };
    try {
      if (isEdit) {
        await api.patch(`/api/roles/${role.id}`, payload);
        toast.success("Role saved. Users get the new permissions on their next page load.");
        qc.invalidateQueries({ queryKey: ["role", role.id] });
      } else {
        const created = await api.post<{ id: number }>("/api/roles", payload);
        toast.success("Role created");
        router.push(`/admin/roles/${created.id}`);
      }
      qc.invalidateQueries({ queryKey: ["roles"] });
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormSection title="Role">
        <FormGrid>
          <Field label="Name" required htmlFor="role-name" error={errors.name}>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </Field>
          <Field label="Description" htmlFor="role-desc" error={errors.description}>
            <Input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          </Field>
          <Field label="Maximum discount (%)" htmlFor="role-disc" error={errors.maxDiscountPercent} hint="Highest discount this role can give on a sale">
            <Input id="role-disc" type="number" step="0.01" min="0" max="100" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Permissions"
        description={isAdmin ? "Admin always has every permission, including ones added in future." : `${perms.size} of ${ALL_PERMISSIONS.length} selected`}
      >
        {errors.permissions && <p className="mb-3 text-xs text-destructive">{errors.permissions[0]}</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PERMISSION_GROUPS.map((g) => {
            const keys = g.items.map((i) => i.key);
            const count = isAdmin ? keys.length : keys.filter((k) => perms.has(k)).length;
            const all = count === keys.length;
            return (
              <div key={g.group} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={all ? true : count > 0 ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleGroup(keys, v === true)}
                      disabled={isAdmin}
                    />
                    {g.group}
                  </label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {count}/{keys.length}
                  </span>
                </div>
                <div className="space-y-1.5 pl-1">
                  {g.items.map((item) => (
                    <label key={item.key} className="flex cursor-pointer items-start gap-2 text-[13px]">
                      <Checkbox
                        className="mt-0.5"
                        checked={isAdmin || perms.has(item.key)}
                        onCheckedChange={(v) => toggle(item.key, v === true)}
                        disabled={isAdmin}
                      />
                      <span>
                        {item.label}
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">{item.key}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/roles")}>
          {isEdit ? "Back" : "Cancel"}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save role" : "Create role"}
        </Button>
      </div>
    </form>
  );
}
