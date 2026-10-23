import { transaction } from "@/lib/db";
import { body, handler, intParam } from "@/lib/http";
import { audit } from "@/lib/audit";
import { reasonSchema } from "@/lib/sales";
import { lockPendingAdjustment } from "../../apply";

/** Rejects a pending stock adjustment; stock is not changed. */
export const POST = handler<{ id: string }>({ permission: "inventory.approve" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const { reason } = await body(req, reasonSchema);
  return transaction(async (tx) => {
    const pending = await lockPendingAdjustment(tx, id);
    const adjustment = await tx.stockAdjustment.update({
      where: { id },
      data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date(), rejectionReason: reason },
    });
    await audit(tx, {
      userId: user.id,
      action: "REJECT",
      entity: "StockAdjustment",
      entityId: id,
      summary: `Adjustment ${pending.adjustmentNo} rejected: ${reason}`,
      before: pending,
      after: adjustment,
      ip,
    });
    return adjustment;
  });
});
