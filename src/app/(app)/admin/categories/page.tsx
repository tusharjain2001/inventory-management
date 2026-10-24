"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/page-header";
import { FilterBar, SearchInput } from "@/components/common/filters";
import { Field } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorBlock, LoadingBlock, RequirePermission } from "@/components/common/misc";
import { useConfirm } from "@/components/common/confirm";
import { ApiError, api, errorMessage, type Paged } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Sub = { id: number; categoryId: number; name: string; description: string | null; isActive: boolean; _count: { products: number } };
type Category = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: { name: string } | null;
  subCategories: Sub[];
  _count: { products: number };
};

type Editing =
  | { kind: "category"; record?: Category }
  | { kind: "sub"; categoryId: number; record?: Sub };

export default function CategoriesPage() {
  return (
    <RequirePermission permission="masters.manage">
      <CategoryManager />
    </RequirePermission>
  );
}

function CategoryManager() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Editing | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["categories", "admin"],
    queryFn: () => api.get<Paged<Category>>("/api/categories"),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["meta"] });
  };

  async function setActive(kind: "category" | "sub", rec: Category | Sub, isActive: boolean) {
    try {
      if (kind === "category") {
        await api.patch(`/api/categories/${rec.id}`, { name: rec.name, description: rec.description, isActive });
      } else {
        const s = rec as Sub;
        await api.patch(`/api/subcategories/${s.id}`, { name: s.name, description: s.description, categoryId: s.categoryId, isActive });
      }
      toast.success(`${rec.name} ${isActive ? "activated" : "deactivated"}`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(kind: "category" | "sub", rec: Category | Sub) {
    const subs = kind === "category" ? (rec as Category).subCategories.length : 0;
    const ok = await confirm({
      title: `Delete ${rec.name}?`,
      description:
        kind === "category" && subs > 0
          ? `Its ${subs} sub-categor${subs === 1 ? "y" : "ies"} will be deleted too.`
          : "This cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(kind === "category" ? `/api/categories/${rec.id}` : `/api/subcategories/${rec.id}`);
      toast.success(`${rec.name} deleted`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !data) return <ErrorBlock error={error} />;

  const needle = q.trim().toLowerCase();
  const matchesStatus = (active: boolean) => status === "all" || (status === "true") === active;
  const rows = data.data
    .map((c) => {
      const catHit = !needle || c.name.toLowerCase().includes(needle);
      const subs = c.subCategories.filter((s) => matchesStatus(s.isActive) && (catHit || s.name.toLowerCase().includes(needle)));
      return { c, subs, show: (catHit || subs.length > 0) && (matchesStatus(c.isActive) || subs.length > 0) };
    })
    .filter((r) => r.show);

  const toggleOpen = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader title="Categories" description="Product categories and sub-categories">
        <Button onClick={() => setEditing({ kind: "category" })}>
          <Plus /> Add Category
        </Button>
      </PageHeader>

      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search categories" />
        <SimpleSelect
          className="h-9 w-32"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
          ]}
        />
      </FilterBar>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {data.data.length ? "No categories match" : "No categories yet. Add the first one."}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ c, subs }) => {
            const open = !collapsed.has(c.id) || !!needle;
            return (
              <div key={c.id} className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <button
                    type="button"
                    onClick={() => toggleOpen(c.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                    <span className="min-w-0">
                      <span className={cn("font-medium", !c.isActive && "text-muted-foreground")}>{c.name}</span>
                      {c.description && <span className="block truncate text-xs text-muted-foreground">{c.description}</span>}
                    </span>
                    {!c.isActive && <StatusBadge status="INACTIVE" />}
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {c._count.products} product{c._count.products === 1 ? "" : "s"} · {c.subCategories.length} sub
                  </span>
                  <RowActions
                    active={c.isActive}
                    onActive={(v) => setActive("category", c, v)}
                    onEdit={() => setEditing({ kind: "category", record: c })}
                    onDelete={() => remove("category", c)}
                    canDelete={c._count.products === 0}
                    deleteHint="Has products. Deactivate it instead."
                  />
                </div>
                {open && (
                  <div className="border-t bg-muted/20 px-3 py-2 sm:pl-9">
                    {subs.map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-0">
                        <div className="min-w-0 flex-1">
                          <span className={cn("text-sm", !s.isActive && "text-muted-foreground")}>{s.name}</span>
                          {!s.isActive && <StatusBadge status="INACTIVE" className="ml-2" />}
                          {s.description && <span className="block truncate text-xs text-muted-foreground">{s.description}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {s._count.products} product{s._count.products === 1 ? "" : "s"}
                        </span>
                        <RowActions
                          active={s.isActive}
                          onActive={(v) => setActive("sub", s, v)}
                          onEdit={() => setEditing({ kind: "sub", categoryId: c.id, record: s })}
                          onDelete={() => remove("sub", s)}
                          canDelete={s._count.products === 0}
                          deleteHint="Has products. Deactivate it instead."
                        />
                      </div>
                    ))}
                    {subs.length === 0 && c.subCategories.length === 0 && (
                      <p className="py-2 text-xs text-muted-foreground">No sub-categories</p>
                    )}
                    <Button variant="ghost" size="sm" className="my-1" onClick={() => setEditing({ kind: "sub", categoryId: c.id })}>
                      <Plus /> Add Sub-Category
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <EditDialog editing={editing} categories={data.data} onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}

function RowActions({
  active,
  onActive,
  onEdit,
  onDelete,
  canDelete,
  deleteHint,
}: {
  active: boolean;
  onActive: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
  deleteHint: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <label className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch size="sm" checked={active} onCheckedChange={onActive} aria-label="Active" />
        Active
      </label>
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit" title="Edit">
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label="Delete"
        title={canDelete ? "Delete" : deleteHint}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function EditDialog({
  editing,
  categories,
  onClose,
  onSaved,
}: {
  editing: Editing | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {editing && (
          <EditForm
            key={`${editing.kind}-${editing.record?.id ?? "new"}`}
            editing={editing}
            categories={categories}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  editing,
  categories,
  onClose,
  onSaved,
}: {
  editing: Editing;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const rec = editing.record;
  const isSub = editing.kind === "sub";
  const [name, setName] = useState(rec?.name ?? "");
  const [description, setDescription] = useState(rec?.description ?? "");
  const [categoryId, setCategoryId] = useState(isSub ? String(editing.categoryId) : "");
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const parent = isSub ? categories.find((c) => c.id === editing.categoryId) : undefined;
  const subHasProducts = isSub && !!rec && (rec as Sub)._count.products > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = { name, description, isActive: rec?.isActive ?? true, ...(isSub ? { categoryId: Number(categoryId) } : {}) };
    const base = isSub ? "/api/subcategories" : "/api/categories";
    try {
      if (rec) await api.patch(`${base}/${rec.id}`, payload);
      else await api.post(base, payload);
      toast.success(rec ? "Saved" : `${isSub ? "Sub-category" : "Category"} added`);
      onSaved();
      onClose();
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
        <DialogTitle>
          {rec ? `Edit ${rec.name}` : isSub ? "Add Sub-Category" : "Add Category"}
        </DialogTitle>
        {isSub && !rec && parent && <DialogDescription>Under {parent.name}</DialogDescription>}
      </DialogHeader>
      <Field label="Name" required htmlFor="cat-name" error={errors.name}>
        <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus />
      </Field>
      <Field label="Description" htmlFor="cat-desc" error={errors.description}>
        <Input id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </Field>
      {isSub && rec && (
        <Field label="Category" error={errors.categoryId} hint={subHasProducts ? "Has products, so it cannot be moved" : undefined}>
          <SimpleSelect
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            disabled={subHasProducts}
          />
        </Field>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : rec ? "Save" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  );
}
