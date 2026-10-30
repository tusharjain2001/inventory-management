import { transaction } from "@/lib/db";
import { handler, intParam, notFound } from "@/lib/http";
import { audit } from "@/lib/audit";
import { formatINR } from "@/lib/format";

/** Undoes a supplier payment entered by mistake: its items show as unpaid again. */
export const DELETE = handler<{ id: string }>({ permission: "consignment.settle" }, async ({ params, user, ip }) => {
  const id = intParam(params.id);
  return transaction(async (tx) => {
    const settlement = await tx.consignmentSettlement.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } });
    if (!settlement) throw notFound("Supplier payment");
    await tx.salesOrderItem.updateMany({ where: { consignmentSettlementId: id }, data: { consignmentSettlementId: null } });
    await tx.consignmentSettlement.delete({ where: { id } });
    await audit(tx, {
      userId: user.id,
      action: "DELETE",
      entity: "ConsignmentSettlement",
      entityId: id,
      summary: `Removed payment of ${formatINR(settlement.amount.toNumber())} to ${settlement.supplier.name}`,
      before: settlement,
      ip,
    });
    return { ok: true };
  });
});
