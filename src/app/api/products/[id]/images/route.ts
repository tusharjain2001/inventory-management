import { db } from "@/lib/db";
import { badRequest, handler, intParam } from "@/lib/http";
import { saveUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** Upload one or more images (multipart field "files"). The first image of a product becomes primary. */
export const POST = handler<{ id: string }>({ permission: ["products.edit", "products.create"] }, async ({ req, user, params, ip }) => {
  const productId = intParam(params.id);
  const product = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { images: true } });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw badRequest("No images uploaded");
  if (files.some((f) => !f.type.startsWith("image/"))) throw badRequest("Only image files are allowed");

  let hasPrimary = product.images.some((i) => i.isPrimary);
  let sortOrder = product.images.reduce((m, i) => Math.max(m, i.sortOrder), 0);
  const created = [];
  for (const file of files) {
    const saved = await saveUpload(file, "products");
    created.push(
      await db.productImage.create({
        data: {
          productId,
          url: saved.url,
          storagePath: saved.path,
          isPrimary: !hasPrimary,
          imageType: hasPrimary ? "GALLERY" : "PRIMARY",
          sortOrder: ++sortOrder,
        },
      }),
    );
    hasPrimary = true;
  }
  await audit(db, { userId: user.id, action: "UPDATE", entity: "Product", entityId: productId, summary: `Added ${files.length} image(s) to ${product.name}`, ip });
  return { data: created };
});
