import { db } from "@/lib/db";
import { AppError, body, handler, intParam } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { categorySchema } from "@/lib/validators";

export const PATCH = handler<{ id: string }>({ permission: "masters.manage" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, categorySchema);
  const before = await db.category.findUniqueOrThrow({ where: { id } });
  const updated = await db.category.update({ where: { id }, data: input });
  const d = diff(before, input);
  if (d.changed) {
    await audit(db, { userId: user.id, action: "UPDATE", entity: "Category", entityId: id, summary: `Updated category ${updated.name}`, before: d.before, after: d.after, ip });
  }
  return updated;
});

export const DELETE = handler<{ id: string }>({ permission: "masters.manage" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  const category = await db.category.findUniqueOrThrow({ where: { id }, include: { _count: { select: { products: true } } } });
  if (category._count.products > 0) {
    throw new AppError(409, `${category.name} has ${category._count.products} product(s). Mark it inactive instead, or move the products first.`);
  }
  await db.$transaction([db.subCategory.deleteMany({ where: { categoryId: id } }), db.category.delete({ where: { id } })]);
  await audit(db, { userId: user.id, action: "DELETE", entity: "Category", entityId: id, summary: `Deleted category ${category.name}`, before: category, ip });
  return { ok: true };
});
