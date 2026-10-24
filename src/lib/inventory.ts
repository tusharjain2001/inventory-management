import { Prisma, type Tx } from "@/lib/db";
import type { StockTxnType } from "@/generated/prisma/client";
import { AppError } from "@/lib/http";
import { getSettingsGroup } from "@/lib/settings";

const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v);

/** Signed effect of each movement type on [showroom stock, stock out on display]. */
const EFFECTS: Record<StockTxnType, [stock: 1 | 0 | -1, display: 1 | 0 | -1]> = {
  OPENING: [1, 0],
  STOCK_IN: [1, 0],
  SALE: [-1, 0],
  SALE_REVERSAL: [1, 0],
  DISPLAY_OUT: [-1, 1],
  DISPLAY_RETURN: [1, -1],
  ADJUSTMENT_IN: [1, 0],
  ADJUSTMENT_OUT: [-1, 0],
  DAMAGED: [-1, 0],
  LOST: [-1, 0],
};

/** Movement types that bring new stock in at a cost and therefore re-average the cost. */
const COSTED_INBOUND: StockTxnType[] = ["OPENING", "STOCK_IN", "SALE_REVERSAL"];

export const STOCK_TXN_LABELS: Record<StockTxnType, string> = {
  OPENING: "Opening Stock",
  STOCK_IN: "Stock In",
  SALE: "Sale",
  SALE_REVERSAL: "Sale Cancelled",
  DISPLAY_OUT: "Out for Display",
  DISPLAY_RETURN: "Returned from Display",
  ADJUSTMENT_IN: "Adjustment (+)",
  ADJUSTMENT_OUT: "Adjustment (−)",
  DAMAGED: "Damaged",
  LOST: "Lost",
};

export type PostStockInput = {
  productId: number;
  type: StockTxnType;
  quantity: number | Prisma.Decimal;
  /** Cost per unit for costed inbound movements (opening, stock-in, sale reversal). Ignored otherwise. */
  unitCost?: number | Prisma.Decimal;
  date: Date;
  refType?: string;
  refId?: number;
  refNo?: string;
  remarks?: string | null;
  userId: number | null;
  /** Skip the negative-stock check (used for reversals that restore stock). */
  skipNegativeCheck?: boolean;
};

/**
 * The only way stock changes. Locks the product row, applies the movement to the cached
 * balances, re-averages cost (weighted average) for costed receipts, and appends an
 * immutable ledger row. Must run inside a transaction.
 */
export async function postStock(tx: Tx, input: PostStockInput) {
  const qty = D(input.quantity);
  if (qty.lte(0)) throw new AppError(400, "Quantity must be greater than zero");

  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${input.productId} FOR UPDATE`;
  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new AppError(404, "Product not found");

  const [s, d] = EFFECTS[input.type];
  const stockEffect = qty.mul(s);
  const displayEffect = qty.mul(d);
  const newStock = product.currentStock.add(stockEffect);
  const newDisplay = product.onDisplayStock.add(displayEffect);

  if (s < 0 && newStock.lt(0) && !input.skipNegativeCheck) {
    const { allowNegativeStock } = await getSettingsGroup("inventory", tx);
    if (!allowNegativeStock) {
      throw new AppError(
        400,
        `Not enough stock for ${product.name} (${product.sku}): available ${product.currentStock.toNumber()}, needed ${qty.toNumber()}`,
      );
    }
  }
  if (newDisplay.lt(0)) {
    throw new AppError(400, `Cannot return more than is out on display for ${product.name}`);
  }

  let unitCost = product.avgCost;
  let avgCost = product.avgCost;
  if (COSTED_INBOUND.includes(input.type)) {
    unitCost = D(input.unitCost ?? product.avgCost);
    const owned = product.currentStock.add(product.onDisplayStock);
    avgCost = owned.lte(0) ? unitCost : owned.mul(product.avgCost).add(qty.mul(unitCost)).div(owned.add(qty));
  }

  await tx.product.update({
    where: { id: product.id },
    data: {
      currentStock: newStock,
      onDisplayStock: newDisplay,
      avgCost: avgCost.toDecimalPlaces(4),
      ...(input.type === "SALE" ? { lastSaleAt: input.date } : {}),
      ...(input.type === "STOCK_IN" ? { lastPurchaseAt: input.date } : {}),
    },
  });

  const txn = await tx.inventoryTransaction.create({
    data: {
      txnDate: input.date,
      productId: product.id,
      type: input.type,
      quantity: qty,
      stockEffect,
      displayEffect,
      unitCost: unitCost.toDecimalPlaces(4),
      totalCost: qty.mul(unitCost).toDecimalPlaces(2),
      balanceAfter: newStock,
      refType: input.refType,
      refId: input.refId,
      refNo: input.refNo,
      remarks: input.remarks ?? null,
      createdById: input.userId,
    },
  });

  return { txn, unitCost, product, newStock };
}

/** Recomputes a display issue's status from its items' outstanding quantities. */
export async function refreshDisplayStatus(tx: Tx, displayIssueId: number) {
  const items = await tx.displayIssueItem.findMany({ where: { displayIssueId } });
  const outstanding = items.reduce(
    (sum, i) => sum.add(i.quantity.sub(i.returnedQty).sub(i.soldQty)),
    new Prisma.Decimal(0),
  );
  const touched = items.some((i) => i.returnedQty.gt(0) || i.soldQty.gt(0));
  const status = outstanding.lte(0) ? "CLOSED" : touched ? "PARTIAL" : "OUT";
  await tx.displayIssue.update({ where: { id: displayIssueId }, data: { status } });
  return status;
}
