import { z } from "zod";
import { db } from "@/lib/db";
import { body, handler, intParam } from "@/lib/http";
import { deleteUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";

const schema = z.object({ isPrimary: z.literal(true).optional(), sortOrder: z.number().int().optional() });

/** Make an image primary and/or change its sort order. */
export const PATCH = handler<{ id: string }>({ permission: "products.edit" }, async ({ req, params }) => {
  const id = intParam(params.id);
  const input = await body(req, schema);
  const image = await db.productImage.findUniqueOrThrow({ where: { id } });
  await db.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.productImage.updateMany({ where: { productId: image.productId }, data: { isPrimary: false, imageType: "GALLERY" } });
      await tx.productImage.update({ where: { id }, data: { isPrimary: true, imageType: "PRIMARY" } });
    }
    if (input.sortOrder !== undefined) await tx.productImage.update({ where: { id }, data: { sortOrder: input.sortOrder } });
  });
  return { ok: true };
});

export const DELETE = handler<{ id: string }>({ permission: "products.edit" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  const image = await db.productImage.findUniqueOrThrow({ where: { id }, include: { product: { select: { name: true } } } });
  await db.productImage.delete({ where: { id } });
  if (image.isPrimary) {
    const next = await db.productImage.findFirst({ where: { productId: image.productId }, orderBy: { sortOrder: "asc" } });
    if (next) await db.productImage.update({ where: { id: next.id }, data: { isPrimary: true, imageType: "PRIMARY" } });
  }
  await deleteUpload(image.storagePath);
  await audit(db, { userId: user.id, action: "UPDATE", entity: "Product", entityId: image.productId, summary: `Removed an image from ${image.product.name}`, ip });
  return { ok: true };
});
