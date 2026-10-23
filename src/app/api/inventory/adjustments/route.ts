import { z } from "zod";
import { db, transaction, type Prisma } from "@/lib/db";
import { AppError, body, handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { getSettingsGroup } from "@/lib/settings";
import { nextDocNumber } from "@/lib/numbering";
import { dateFromInput } from "@/lib/dates";
import { ADJUSTMENT_REASONS, ADJUSTMENT_STATUSES, ADJUSTMENT_TYPES } from "@/app/(app)/inventory/constants";
import { applyAdjustment } from "./apply";
import { idField, lockProduct, optText, pastDate, qtyField, spEnum } from "../shared";

const adjustmentSchema = z
  .object({
    date: pastDate("Date"),
    productId: idField("Choose a product"),
    type: z.enum(ADJUSTMENT_TYPES, { message: "Choose increase or decrease" }),
    quantity: qtyField,
    reason: z.enum(ADJUSTMENT_REASONS, { message: "Choose a reason" }),
    remarks: optText(1000),
  })
  .refine((a) => a.reason !== "Other" || a.remarks, {
    message: "Please explain the reason in remarks",
    path: ["remarks"],
  });

/** ?q= (product name/SKU, adjustment no) &productId &type=INCREASE|DECREASE &status=PENDING|APPROVED|REJECTED &reason &from&to &sort=date:dir */
export const GET = handler({ permission: "inventory.view" }, async ({ req }) => {
  const lq = listQuery(req, ["date", "quantity"]);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const type = spEnum(sp, "type", ADJUSTMENT_TYPES);
  const status = spEnum(sp, "status", ADJUSTMENT_STATUSES);
  const reason = sp.get("reason");
  const where: Prisma.StockAdjustmentWhereInput = {
    ...(range ? { date: range } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
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
  const [rows, total, pendingCount] = await Promise.all([
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
    db.stockAdjustment.count({ where: { status: "PENDING" } }),
  ]);
  return { ...paged(rows, total, lq), pendingCount };
});

/**
 * Users who can approve (Manager, Admin) apply the adjustment straight away and are recorded as the approver.
 * Anyone else creates a PENDING request: stock does not change until an approver accepts it.
 */
export const POST = handler({ permission: "inventory.adjust" }, async ({ req, user, ip }) => {
  const input = await body(req, adjustmentSchema);
  const date = dateFromInput(input.date);
  const canApprove = hasPermission(user, "inventory.approve");

  return transaction(async (tx) => {
    // Lock first so the recorded "existing stock" is exactly what the movement is applied to.
    const product = await lockProduct(tx, input.productId);
    const existingStock = product.currentStock;
    const newStock = input.type === "INCREASE" ? existingStock.add(input.quantity) : existingStock.sub(input.quantity);
    if (!canApprove && newStock.isNegative() && !(await getSettingsGroup("inventory", tx)).allowNegativeStock) {
      throw new AppError(400, `Only ${existingStock.toNumber()} in the showroom. Stock cannot go below zero.`, { quantity: ["Too large"] });
    }

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
        status: "PENDING",
        createdById: user.id,
      },
    });

    if (canApprove) return applyAdjustment(tx, adjustment.id, user.id, ip);

    await audit(tx, {
      userId: user.id,
      action: "CREATE",
      entity: "StockAdjustment",
      entityId: adjustment.id,
      summary: `Adjustment ${adjustmentNo} requested: ${product.name} (${product.sku}) ${input.type === "INCREASE" ? "+" : "-"}${input.quantity} (${input.reason}), awaiting approval`,
      after: adjustment,
      ip,
    });
    return adjustment;
  });
});
