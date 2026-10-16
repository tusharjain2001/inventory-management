import { db } from "@/lib/db";
import { body, handler } from "@/lib/http";
import { audit } from "@/lib/audit";
import { subCategorySchema } from "@/lib/validators";

export const POST = handler({ permission: "masters.manage" }, async ({ req, user, ip }) => {
  const input = await body(req, subCategorySchema);
  const created = await db.subCategory.create({ data: input, include: { category: { select: { name: true } } } });
  await audit(db, {
    userId: user.id,
    action: "CREATE",
    entity: "SubCategory",
    entityId: created.id,
    summary: `Created sub-category ${created.category.name} › ${created.name}`,
    after: created,
    ip,
  });
  return created;
});
