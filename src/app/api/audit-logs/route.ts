import { db, type Prisma } from "@/lib/db";
import { handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";

/**
 * Audit trail, newest first.
 * ?from&to (YYYY-MM-DD) &userId &entity &entityId &action &q (summary) &page &pageSize
 * ?facets=true returns { entities, actions } for the filter dropdowns instead.
 */
export const GET = handler({ permission: "audit.view" }, async ({ req }) => {
  const lq = listQuery(req);
  const sp = lq.sp;

  if (sp.get("facets") === "true") {
    const [entities, actions] = await Promise.all([
      db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
      db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    ]);
    return { entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action) };
  }

  const range = spDateRange(sp);
  const userId = spInt(sp, "userId");
  const entity = sp.get("entity");
  const entityId = sp.get("entityId");
  const action = sp.get("action");
  const where: Prisma.AuditLogWhereInput = {
    ...(range ? { createdAt: range } : {}),
    ...(userId ? { userId } : {}),
    ...(entity ? { entity } : {}),
    ...(entityId ? { entityId } : {}),
    ...(action ? { action } : {}),
    ...(lq.q ? { summary: { contains: lq.q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: { user: { select: { id: true, name: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return paged(rows, total, lq);
});
