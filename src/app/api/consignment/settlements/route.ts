import { z } from "zod";
import { db, transaction } from "@/lib/db";
import { AppError, body, handler, spInt } from "@/lib/http";
import { audit } from "@/lib/audit";
import { round2 } from "@/lib/calc";
import { dateFromInput } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import { PAYMENT_MODES } from "@/lib/sales";
import { idField, optText, pastDate } from "../../inventory/shared";

const settlementSchema = z.object({
  supplierId: idField("Choose a supplier"),
  itemIds: z.array(idField("Invalid item"), { message: "Choose the items being paid for" }).min(1, "Choose the items being paid for"),
  date: pastDate("Payment date").optional().nullable(),
  mode: z.enum(PAYMENT_MODES, { message: "Choose a payment mode" }),
  reference: optText(100),
  remarks: optText(1000),
});

/** Payments made to consignment suppliers. ?supplierId */
export const GET = handler({ permission: "reports.purchase" }, async ({ req }) => {
  const supplierId = spInt(req.nextUrl.searchParams, "supplierId");
  const rows = await db.consignmentSettlement.findMany({
    where: supplierId ? { supplierId } : {},
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 500,
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });
  return { data: rows };
});

/** Pays a consignment supplier for sold items; the amount is what those items left stock at. */
export const POST = handler({ permission: "consignment.settle" }, async ({ req, user, ip }) => {
  const input = await body(req, settlementSchema);
  if (new Set(input.itemIds).size !== input.itemIds.length) throw new AppError(400, "An item is listed more than once");

  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SalesOrderItem" WHERE id = ANY(${input.itemIds}) ORDER BY id FOR UPDATE`;
    const items = await tx.salesOrderItem.findMany({
      where: { id: { in: input.itemIds } },
      select: {
        id: true,
        sku: true,
        quantity: true,
        unitCost: true,
        consignmentSupplierId: true,
        consignmentSettlementId: true,
        order: { select: { orderNo: true, status: true } },
      },
    });
    if (items.length !== input.itemIds.length) throw new AppError(400, "Some items were not found. Refresh and try again.");
    for (const i of items) {
      if (i.consignmentSupplierId !== input.supplierId) throw new AppError(400, `${i.sku} (${i.order.orderNo}) is not a consignment sale of this supplier`);
      if (i.consignmentSettlementId) throw new AppError(409, `${i.sku} (${i.order.orderNo}) has already been paid for`);
      if (i.order.status !== "CONFIRMED" && i.order.status !== "INVOICED") throw new AppError(400, `${i.order.orderNo} is cancelled, so nothing is owed for it`);
    }

    const amount = round2(items.reduce((s, i) => s + i.quantity.toNumber() * round2(i.unitCost.toNumber()), 0));
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId }, select: { name: true } });
    const settlement = await tx.consignmentSettlement.create({
      data: {
        supplierId: input.supplierId,
        date: dateFromInput(input.date),
        amount,
        mode: input.mode,
        reference: input.reference,
        remarks: input.remarks,
        createdById: user.id,
      },
    });
    await tx.salesOrderItem.updateMany({ where: { id: { in: input.itemIds } }, data: { consignmentSettlementId: settlement.id } });

    await audit(tx, {
      userId: user.id,
      action: "CREATE",
      entity: "ConsignmentSettlement",
      entityId: settlement.id,
      summary: `Paid ${supplier.name} ${formatINR(amount)} for ${items.length} consignment item(s)`,
      after: { ...settlement, itemIds: input.itemIds },
      ip,
    });
    return settlement;
  });
});
