import { db, type DbOrTx } from "@/lib/db";
import { toPlain } from "@/lib/http";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "CANCEL"
  | "CONFIRM"
  | "INVOICE"
  | "OVERRIDE"
  | "LOGIN"
  | "LOGOUT"
  | "PASSWORD"
  | "IMPORT"
  | "SETTINGS"
  | "RETURN";

/** Writes an audit trail entry. Pass the transaction client so the log commits with the change. */
export async function audit(
  client: DbOrTx,
  entry: {
    userId: number | null;
    action: AuditAction;
    entity: string;
    entityId?: string | number | null;
    summary: string;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  },
) {
  await (client ?? db).auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      summary: entry.summary.slice(0, 500),
      before: entry.before === undefined ? undefined : (toPlain(entry.before) as object),
      after: entry.after === undefined ? undefined : (toPlain(entry.after) as object),
      ip: entry.ip ?? null,
    },
  });
}

/** Returns only the fields that changed between two flat records (for compact audit entries). */
export function diff(before: object, after: object) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = toPlain((before as Record<string, unknown>)[key]);
    const next = toPlain((after as Record<string, unknown>)[key]);
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[key] = prev;
      a[key] = next;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
