import { z } from "zod";
import { db, transaction, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { audit } from "@/lib/audit";
import { postStock } from "@/lib/inventory";
import { nextDocNumber } from "@/lib/numbering";
import { dateFromInput } from "@/lib/dates";
import { ADJUSTMENT_REASONS, ADJUSTMENT_TYPES } from "@/app/(app)/inventory/constants";
import { assertApprover, idField, lockProduct, optId, optText, pastDate, qtyField, spEnum } from "../shared";

const adjustmentSchema = z
  .object({
    date: pastDate("Date"),
    productId: idField("Choose a product"),
    type: z.enum(ADJUSTMENT_TYPES, { message: "Choose increase or decrease" }),
    quantity: qtyField,
    reason: z.enum(ADJUSTMENT_REASONS, { message: "Choose a reason" }),
    remarks: optText(1000),
    approvedById: optId,
  })
  .refine((a) => a.reason !== "Other" || a.remarks, {
    message: "Please explain the reason in remarks",
    path: ["remarks"],
  });

/** ?q= (product name/SKU, adjustment no) &productId &type=INCREASE|DECREASE &reason &from&to &sort=date:dir */
export const GET = handler({ permission: "inventory.view" }, async ({ req }) => {
  const lq = listQuery(req, ["date", "quantity"]);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const type = spEnum(sp, "type", ADJUSTMENT_TYPES);
  const reason = sp.get("reason");
  const where: Prisma.StockAdjustmentWhereInput = {
    ...(range ? { date: range } : {}),
    ...(type ? { type } : {}),
    ...(reason ? { reason } : {}),
    ...(spInt(sp, "productId") ? { productId: spInt(sp, "productId") } : {}),
    ...(lq.q
      ? {
          OR: [
            { adjustmentNo: { contains: lq.q, mode: "insensitive" } },
            { product: { name: { contains: lq.q, mode: "insensitive" } } },
            { product: { sku: { contains: lq.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.stockAdjustment.findMany({
      where,
      orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }, { id: "desc" }] : [{ date: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        approvedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    db.stockAdjustment.count({ where }),
  ]);
  return paged(rows, total, lq);
});

export const POST = handler({ permission: "inventory.adjust" }, async ({ req, user, ip }) => {
  const input = await body(req, adjustmentSchema);
  const date = dateFromInput(input.date);

  return transaction(async (tx) => {
    if (input.approvedById) await assertApprover(tx, input.approvedById);
    // Lock first so the recorded "existing stock" is exactly what the movement is applied to.
    const product = await lockProduct(tx, input.productId);
    const existingStock = product.currentStock;
    const newStock = input.type === "INCREASE" ? existingStock.add(input.quantity) : existingStock.sub(input.quantity);

    const adjustmentNo = await nextDocNumber(tx, "adjustment", date);
    const adjustment = await tx.stockAdjustment.create({
      data: {
        adjustmentNo,
        date,
        productId: product.id,
        type: input.type,
        existingStock,
        quantity: input.quantity,
        newStock,
        reason: input.reason,
        remarks: input.remarks,
        approvedById: input.approvedById,
        createdById: user.id,
      },
    });
    // postStock blocks the decrease if it would make stock negative (unless allowed in settings).
    await postStock(tx, {
      productId: product.id,
      type: input.type === "INCREASE" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      quantity: input.quantity,
      date,
      refType: "StockAdjustment",
      refId: adjustment.id,
      refNo: adjustmentNo,
      remarks: input.remarks ? `${input.reason}: ${input.remarks}` : input.reason,
      userId: user.id,
    });

    await audit(tx, {
      userId: user.id,
      action: "CREATE",
      entity: "StockAdjustment",
      entityId: adjustment.id,
      summary: `Adjustment ${adjustmentNo}: ${product.name} (${product.sku}) ${input.type === "INCREASE" ? "+" : "-"}${input.quantity}, ${existingStock.toNumber()} to ${newStock.toNumber()} (${input.reason})`,
      after: adjustment,
      ip,
    });
    return adjustment;
  });
});
