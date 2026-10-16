import { db } from "@/lib/db";
import { body, handler } from "@/lib/http";
import { audit } from "@/lib/audit";
import { categorySchema } from "@/lib/validators";

/** All categories with their sub-categories and product counts. ?active=true to hide inactive ones. */
export const GET = handler({}, async ({ req }) => {
  const activeOnly = req.nextUrl.searchParams.get("active") === "true";
  const where = activeOnly ? { isActive: true } : {};
  const rows = await db.category.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      createdBy: { select: { name: true } },
      subCategories: {
        where,
        orderBy: { name: "asc" },
        include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      },
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });
  return { data: rows, total: rows.length, page: 1, pageSize: rows.length };
});

export const POST = handler({ permission: "masters.manage" }, async ({ req, user, ip }) => {
  const input = await body(req, categorySchema);
  const created = await db.category.create({ data: { ...input, createdById: user.id } });
  await audit(db, { userId: user.id, action: "CREATE", entity: "Category", entityId: created.id, summary: `Created category ${created.name}`, after: created, ip });
  return created;
});
