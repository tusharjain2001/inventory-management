"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormGrid } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { useSession } from "@/components/session-provider";
import { ApiError, api, errorMessage } from "@/lib/api-client";

export type UserRow = {
  id: number;
  name: string;
  email: string;
  username: string | null;
  phone: string | null;
  roleId: number;
  role: { id: number; key: string; name: string };
  isActive: boolean;
  isLocked: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
};

export type RoleOption = { id: number; key: string; name: string };

type FormState = { name: string; email: string; username: string; phone: string; roleId: string; isActive: boolean; password: string };

/** Create (no `user`) or edit a user. */
export function UserDialog({
  open,
  onOpenChange,
  user,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserRow | null;
  roles: RoleOption[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Remount the form for each user so it starts from that user's values. */}
        {open && <UserForm key={user?.id ?? "new"} user={user} roles={roles} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function UserForm({ user, roles, onDone }: { user?: UserRow | null; roles: RoleOption[]; onDone: () => void }) {
  const qc = useQueryClient();
  const { user: me } = useSession();
  const isEdit = !!user;
  const isSelf = user?.id === me.id;
  const defaultRole = roles.find((r) => r.key === "SALES") ?? roles[0];
  const [form, setForm] = useState<FormState>({
    name: user?.name ?? "",
    email: user?.email ?? "",
    username: user?.username ?? "",
    phone: user?.phone ?? "",
    roleId: user ? String(user.roleId) : defaultRole ? String(defaultRole.id) : "",
    isActive: user?.isActive ?? true,
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const { password, ...rest } = form;
    try {
      if (isEdit) {
        await api.patch(`/api/users/${user.id}`, rest);
        toast.success("User updated");
      } else {
        await api.post("/api/users", { ...rest, password });
        toast.success("User created");
      }
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${user.name}` : "Add User"}</DialogTitle>
        <DialogDescription>{isEdit ? "Change details, role or access." : "The user signs in with their email or username."}</DialogDescription>
      </DialogHeader>
      <FormGrid cols={2}>
        <Field label="Name" required htmlFor="u-name" error={errors.name}>
          <Input id="u-name" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus />
        </Field>
        <Field label="Email" required htmlFor="u-email" error={errors.email}>
          <Input id="u-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        </Field>
        <Field label="Username" htmlFor="u-username" error={errors.username} hint="Optional, for signing in">
          <Input id="u-username" value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor="u-phone" error={errors.phone}>
          <Input id="u-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Role" required error={errors.roleId} hint={isSelf ? "You cannot change your own role" : undefined}>
          <SimpleSelect
            value={form.roleId}
            onChange={(v) => set("roleId", v)}
            options={roles.map((r) => ({ value: String(r.id), label: r.name }))}
            placeholder="Choose Role"
            disabled={isSelf}
          />
        </Field>
        {isEdit ? (
          <Field label="Active" hint={isSelf ? "You cannot deactivate yourself" : "Inactive users cannot sign in"}>
            <div className="flex h-9 items-center">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} disabled={isSelf} />
            </div>
          </Field>
        ) : (
          <Field label="Initial Password" required htmlFor="u-password" error={errors.password} hint="At least 8 characters">
            <Input
              id="u-password"
              type="text"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </Field>
        )}
      </FormGrid>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Admin sets a new password for a user (signs them out everywhere). */
export function ResetPasswordDialog({ user, onOpenChange }: { user: UserRow | null; onOpenChange: (open: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string[]>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/api/users/${user.id}/password`, { password });
      toast.success(`Password changed for ${user.name}`);
      setPassword("");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) setError(err.fieldErrors?.password);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!user}
      onOpenChange={(o) => {
        if (!o) setPassword("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {user?.name}. They will be signed out on all devices and must use the new password.
            </DialogDescription>
          </DialogHeader>
          <Field label="New Password" required htmlFor="new-password" error={error} hint="At least 8 characters">
            <Input
              id="new-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
              autoComplete="new-password"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || password.length < 8}>
              {busy ? "Saving…" : "Set Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
