import { db, transaction, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged, spInt } from "@/lib/http";
import { productCreateSchema } from "@/lib/validators";
import { createProduct, presentProduct } from "@/lib/products";

/**
 * ?q= (name/SKU/HSN) &categoryId &subCategoryId &supplierId
 * &status=IN_STOCK|LOW_STOCK|OUT_OF_STOCK|NEGATIVE &active=true|false|all (default true)
 * &sort=name|sku|currentStock|sellingPrice|createdAt|updatedAt:dir
 */
export const GET = handler({ permission: ["products.view", "sales.create", "inventory.view"] }, async ({ req, user }) => {
  const lq = listQuery(req, ["name", "sku", "currentStock", "sellingPrice", "createdAt", "updatedAt"]);
  const sp = lq.sp;
  const active = sp.get("active") ?? "true";
  const status = sp.get("status");
  const f = db.product.fields;
  const statusWhere: Prisma.ProductWhereInput =
    status === "OUT_OF_STOCK"
      ? { currentStock: 0 }
      : status === "NEGATIVE"
        ? { currentStock: { lt: 0 } }
        : status === "LOW_STOCK"
          ? { currentStock: { gt: 0, lte: f.reorderLevel } }
          : status === "IN_STOCK"
            ? { currentStock: { gt: f.reorderLevel } }
            : status === "AVAILABLE"
              ? { currentStock: { gt: 0 } }
              : {};

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(active === "all" ? {} : { isActive: active === "true" }),
    ...(spInt(sp, "categoryId") ? { categoryId: spInt(sp, "categoryId") } : {}),
    ...(spInt(sp, "subCategoryId") ? { subCategoryId: spInt(sp, "subCategoryId") } : {}),
    ...(spInt(sp, "supplierId") ? { preferredSupplierId: spInt(sp, "supplierId") } : {}),
    ...statusWhere,
    ...(lq.q
      ? {
          OR: [
            { name: { contains: lq.q, mode: "insensitive" } },
            { sku: { contains: lq.q, mode: "insensitive" } },
            { hsnCode: { contains: lq.q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: lq.sort ? { [lq.sort.field]: lq.sort.dir } : { name: "asc" },
      skip: lq.skip,
      take: lq.take,
      include: {
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
        preferredSupplier: { select: { id: true, name: true } },
        images: { where: { isPrimary: true }, take: 1, select: { url: true } },
      },
    }),
    db.product.count({ where }),
  ]);

  return paged(
    rows.map(({ images, ...p }) => ({ ...presentProduct(p, user), imageUrl: images[0]?.url ?? null })),
    total,
    lq,
  );
});

export const POST = handler({ permission: "products.create" }, async ({ req, user, ip }) => {
  const input = await body(req, productCreateSchema);
  const product = await transaction((tx) => createProduct(tx, input, user.id, ip));
  return product;
});
