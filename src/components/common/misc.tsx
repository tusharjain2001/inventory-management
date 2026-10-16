"use client";

import { ShieldAlert } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatQty } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Page-level guard: shows a "no access" message instead of the page content. */
export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: React.ReactNode }) {
  const { canAny } = useSession();
  if (!canAny(Array.isArray(permission) ? permission : [permission])) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <ShieldAlert className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No access</h2>
        <p className="text-sm text-muted-foreground">You don&apos;t have permission to view this page. Ask an administrator if you need access.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatINR(value)}</span>;
}

export function Qty({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatQty(value)}</span>;
}

/** KPI tile for dashboards and report summaries. */
export function StatCard({
  label,
  value,
  sub,
  loading,
  className,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn("rounded-lg border bg-card p-4", onClick && "cursor-pointer transition-colors hover:bg-muted/40", className)}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{loading ? <Skeleton className="h-7 w-28" /> : value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{loading ? <Skeleton className="h-3 w-20" /> : sub}</div>}
    </div>
  );
}

/** Two-column label/value list used on detail pages. */
export function DetailList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="break-words">{i.value === null || i.value === undefined || i.value === "" ? "—" : i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ErrorBlock({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {error instanceof Error ? error.message : "Could not load this page."}
    </div>
  );
}
