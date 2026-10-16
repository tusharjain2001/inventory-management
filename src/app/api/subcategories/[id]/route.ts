import { db } from "@/lib/db";
import { AppError, body, handler, intParam } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { subCategorySchema } from "@/lib/validators";

export const PATCH = handler<{ id: string }>({ permission: "masters.manage" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, subCategorySchema);
  const before = await db.subCategory.findUniqueOrThrow({ where: { id } });
  if (before.categoryId !== input.categoryId && (await db.product.count({ where: { subCategoryId: id } })) > 0) {
    throw new AppError(409, "This sub-category has products, so it cannot be moved to another category");
  }
  const updated = await db.subCategory.update({ where: { id }, data: input });
  const d = diff(before, input);
  if (d.changed) {
    await audit(db, { userId: user.id, action: "UPDATE", entity: "SubCategory", entityId: id, summary: `Updated sub-category ${updated.name}`, before: d.before, after: d.after, ip });
  }
  return updated;
});

export const DELETE = handler<{ id: string }>({ permission: "masters.manage" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  const sub = await db.subCategory.findUniqueOrThrow({ where: { id }, include: { _count: { select: { products: true } } } });
  if (sub._count.products > 0) {
    throw new AppError(409, `${sub.name} has ${sub._count.products} product(s). Mark it inactive instead.`);
  }
  await db.subCategory.delete({ where: { id } });
  await audit(db, { userId: user.id, action: "DELETE", entity: "SubCategory", entityId: id, summary: `Deleted sub-category ${sub.name}`, before: sub, ip });
  return { ok: true };
});
