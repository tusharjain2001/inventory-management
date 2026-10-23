import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { postStock } from "@/lib/inventory";
import { lockProduct } from "../shared";

/** Locks a pending adjustment so two approvers cannot act on it at once. */
export async function lockPendingAdjustment(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM "StockAdjustment" WHERE id = ${id} FOR UPDATE`;
  const adjustment = await tx.stockAdjustment.findUnique({ where: { id } });
  if (!adjustment) throw new AppError(404, "Adjustment not found");
  if (adjustment.status !== "PENDING") {
    throw new AppError(409, `Adjustment ${adjustment.adjustmentNo} has already been ${adjustment.status.toLowerCase()}`);
  }
  return adjustment;
}

/**
 * Approves a pending adjustment and moves the stock. The before/after figures are taken at approval time,
 * because sales may have changed the stock since the request was made.
 */
export async function applyAdjustment(tx: Tx, id: number, approverId: number, ip: string | null, postDate?: Date) {
  const pending = await lockPendingAdjustment(tx, id);
  const product = await lockProduct(tx, pending.productId);
  const existingStock = product.currentStock;
  const newStock = pending.type === "INCREASE" ? existingStock.add(pending.quantity) : existingStock.sub(pending.quantity);

  // postStock blocks the decrease if it would make stock negative (unless allowed in settings).
  await postStock(tx, {
    productId: product.id,
    type: pending.type === "INCREASE" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    quantity: pending.quantity,
    date: postDate ?? pending.date,
    refType: "StockAdjustment",
    refId: pending.id,
    refNo: pending.adjustmentNo,
    remarks: pending.remarks ? `${pending.reason}: ${pending.remarks}` : pending.reason,
    userId: approverId,
  });

  const adjustment = await tx.stockAdjustment.update({
    where: { id },
    data: { status: "APPROVED", approvedById: approverId, approvedAt: new Date(), existingStock, newStock },
  });
  const selfApproved = pending.createdById === approverId;
  await audit(tx, {
    userId: approverId,
    action: selfApproved ? "CREATE" : "APPROVE",
    entity: "StockAdjustment",
    entityId: id,
    summary: `Adjustment ${pending.adjustmentNo}${selfApproved ? "" : " approved"}: ${product.name} (${product.sku}) ${pending.type === "INCREASE" ? "+" : "-"}${pending.quantity.toNumber()}, ${existingStock.toNumber()} to ${newStock.toNumber()} (${pending.reason})`,
    before: selfApproved ? undefined : pending,
    after: adjustment,
    ip,
  });
  return adjustment;
}
