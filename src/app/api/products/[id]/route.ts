import { db } from "@/lib/db";
import { AppError, body, forbidden, handler, intParam } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { productSchema } from "@/lib/validators";
import { assertCategoryPair, presentProduct } from "@/lib/products";
import { hasPermission } from "@/lib/permissions";
import { addDays } from "@/lib/dates";

export const GET = handler<{ id: string }>({ permission: ["products.view", "sales.create", "inventory.view"] }, async ({ params, user }) => {
  const id = intParam(params.id);
  const product = await db.product.findFirst({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      preferredSupplier: { select: { id: true, name: true } },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }] },
      createdBy: { select: { name: true } },
    },
  });
  if (!product) throw new AppError(404, "Product not found");

  const since = addDays(new Date(), -90);
  const [sold90, soldAll] = await Promise.all([
    db.salesOrderItem.aggregate({
      where: { productId: id, order: { status: { in: ["CONFIRMED", "INVOICED"] }, orderDate: { gte: since } } },
      _sum: { quantity: true, taxableValue: true },
    }),
    db.salesOrderItem.aggregate({
      where: { productId: id, order: { status: { in: ["CONFIRMED", "INVOICED"] } } },
      _sum: { quantity: true, taxableValue: true },
    }),
  ]);

  return {
    ...presentProduct(product, user),
    sales: {
      last90DaysQty: sold90._sum.quantity?.toNumber() ?? 0,
      last90DaysValue: sold90._sum.taxableValue?.toNumber() ?? 0,
      totalQty: soldAll._sum.quantity?.toNumber() ?? 0,
      totalValue: soldAll._sum.taxableValue?.toNumber() ?? 0,
    },
  };
});

export const PATCH = handler<{ id: string }>({ permission: "products.edit" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, productSchema);
  const before = await db.product.findUniqueOrThrow({ where: { id } });
  if (before.deletedAt) throw new AppError(400, "This product has been deleted");
  await assertCategoryPair(db, input.categoryId, input.subCategoryId ?? null);

  // Users without cost permissions cannot see or change cost fields; keep the stored values.
  const canEditCost = hasPermission(user, "products.editCost");
  if (!canEditCost) {
    if (hasPermission(user, "products.viewCost") && Number(input.purchasePrice) !== before.purchasePrice.toNumber()) {
      throw forbidden("You are not allowed to change the purchase price");
    }
    input.purchasePrice = before.purchasePrice.toNumber();
    if (!hasPermission(user, "products.viewCost")) input.minSellingPrice = before.minSellingPrice?.toNumber() ?? null;
  }

  const updated = await db.product.update({ where: { id }, data: input });
  const d = diff(before, input);
  if (d.changed) {
    const priceChanged = "purchasePrice" in d.after || "sellingPrice" in d.after;
    await audit(db, {
      userId: user.id,
      action: "UPDATE",
      entity: "Product",
      entityId: id,
      summary: `Updated product ${updated.name} (${updated.sku})${priceChanged ? " — price changed" : ""}`,
      before: d.before,
      after: d.after,
      ip,
    });
  }
  return updated;
});

/** Soft delete: the product disappears from lists but its history stays intact. */
export const DELETE = handler<{ id: string }>({ permission: "products.delete" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  const product = await db.product.findUniqueOrThrow({ where: { id } });
  if (product.currentStock.gt(0) || product.onDisplayStock.gt(0)) {
    throw new AppError(
      409,
      `${product.name} still has ${product.currentStock.add(product.onDisplayStock).toNumber()} in stock. Adjust stock to zero or mark it inactive instead.`,
    );
  }
  await db.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await audit(db, { userId: user.id, action: "DELETE", entity: "Product", entityId: id, summary: `Deleted product ${product.name} (${product.sku})`, before: product, ip });
  return { ok: true };
});
