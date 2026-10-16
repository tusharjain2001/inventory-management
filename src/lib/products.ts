import { db, Prisma, type Tx } from "@/lib/db";
import { AppError } from "@/lib/http";
import { postStock } from "@/lib/inventory";
import { nextDocNumber } from "@/lib/numbering";
import { audit } from "@/lib/audit";
import { stockStatus } from "@/lib/calc";
import { hasPermission, type SessionUser } from "@/lib/permissions";
import type { z } from "zod";
import type { productCreateSchema, productSchema } from "@/lib/validators";

type ProductData = z.output<typeof productSchema>;

export async function assertCategoryPair(tx: Tx | typeof db, categoryId: number, subCategoryId: number | null) {
  if (!subCategoryId) return;
  const sub = await tx.subCategory.findUnique({ where: { id: subCategoryId } });
  if (!sub || sub.categoryId !== categoryId) {
    throw new AppError(400, "Sub-category does not belong to the selected category", {
      subCategoryId: ["Choose a sub-category of the selected category"],
    });
  }
}

/** Creates a product and, if given, its opening stock (as an OPENING stock-in + ledger row). */
export async function createProduct(
  tx: Tx,
  input: z.output<typeof productCreateSchema>,
  userId: number,
  ip: string | null,
) {
  const { openingStock, openingUnitCost, ...data } = input;
  await assertCategoryPair(tx, data.categoryId, data.subCategoryId ?? null);
  const product = await tx.product.create({
    data: { ...(data as ProductData), avgCost: data.purchasePrice, createdById: userId },
  });

  if (openingStock && openingStock > 0) {
    const date = new Date();
    const unitCost = openingUnitCost ?? data.purchasePrice;
    const stockInNo = await nextDocNumber(tx, "stockIn", date);
    const total = new Prisma.Decimal(openingStock).mul(unitCost).toDecimalPlaces(2);
    const stockIn = await tx.stockIn.create({
      data: {
        stockInNo,
        date,
        source: "OPENING",
        remarks: "Opening stock",
        subtotal: total,
        taxableTotal: total,
        total,
        createdById: userId,
        items: {
          create: [{ productId: product.id, quantity: openingStock, unitCost, taxableValue: total, totalCost: total }],
        },
      },
    });
    await postStock(tx, {
      productId: product.id,
      type: "OPENING",
      quantity: openingStock,
      unitCost,
      date,
      refType: "StockIn",
      refId: stockIn.id,
      refNo: stockInNo,
      remarks: "Opening stock",
      userId,
    });
  }

  await audit(tx, {
    userId,
    action: "CREATE",
    entity: "Product",
    entityId: product.id,
    summary: `Created product ${product.name} (${product.sku})${openingStock ? ` with opening stock ${openingStock}` : ""}`,
    after: product,
    ip,
  });
  return product;
}

/** Shapes a product row for API output: adds stock status/value and hides cost fields when not permitted. */
export function presentProduct<
  T extends {
    currentStock: Prisma.Decimal;
    onDisplayStock: Prisma.Decimal;
    reorderLevel: Prisma.Decimal;
    avgCost: Prisma.Decimal;
    purchasePrice: Prisma.Decimal;
  },
>(p: T, user: SessionUser) {
  const canCost = hasPermission(user, "products.viewCost");
  const current = p.currentStock.toNumber();
  const owned = current + p.onDisplayStock.toNumber();
  const out: Record<string, unknown> = {
    ...p,
    stockStatus: stockStatus(current, p.reorderLevel.toNumber()),
    ownedStock: owned,
  };
  if (canCost) out.stockValue = Math.round(owned * p.avgCost.toNumber() * 100) / 100;
  else {
    delete out.purchasePrice;
    delete out.avgCost;
    delete out.minSellingPrice;
  }
  return out;
}
