import { z } from "zod";
import { db, transaction, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { audit } from "@/lib/audit";
import { postStock } from "@/lib/inventory";
import { nextDocNumber } from "@/lib/numbering";
import { dateFromInput } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { LOSS_TYPES } from "@/app/(app)/inventory/constants";
import { assertApprover, idField, lockProduct, optId, optText, pastDate, qtyField, spEnum } from "../shared";

const lossSchema = z
  .object({
    type: z.enum(LOSS_TYPES, { message: "Choose damaged or lost" }),
    date: pastDate("Date"),
    productId: idField("Choose a product"),
    quantity: qtyField,
    reason: z.string({ message: "Reason is required" }).trim().min(1, "Reason is required").max(500),
    location: optText(200),
    remarks: optText(1000),
    // Only URLs returned by /api/uploads (local files or Supabase Storage); shown as a link later.
    attachmentUrl: optText(1000).refine((v) => !v || v.startsWith("/api/files/") || v.startsWith("https://"), "Invalid attachment"),
    attachmentPath: optText(500),
    approvedById: optId,
  })
  .refine((l) => l.type !== "LOST" || l.approvedById, {
    message: "Lost stock must be approved. Choose the approver.",
    path: ["approvedById"],
  });

/** ?q= (product name/SKU, loss no) &productId &type=DAMAGED|LOST &from&to &sort=date:dir */
export const GET = handler({ permission: "inventory.view" }, async ({ req, user }) => {
  const lq = listQuery(req, ["date", "quantity"]);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const type = spEnum(sp, "type", LOSS_TYPES);
  const where: Prisma.StockLossWhereInput = {
    ...(range ? { date: range } : {}),
    ...(type ? { type } : {}),
    ...(spInt(sp, "productId") ? { productId: spInt(sp, "productId") } : {}),
    ...(lq.q
      ? {
          OR: [
            { lossNo: { contains: lq.q, mode: "insensitive" } },
            { product: { name: { contains: lq.q, mode: "insensitive" } } },
            { product: { sku: { contains: lq.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.stockLoss.findMany({
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
    db.stockLoss.count({ where }),
  ]);
  const showCost = hasPermission(user, "products.viewCost");
  return paged(
    rows.map((r) =>
      showCost
        ? { ...r, value: Math.round(r.quantity.mul(r.unitCost).toNumber() * 100) / 100 }
        : { ...r, unitCost: undefined },
    ),
    total,
    lq,
  );
});

export const POST = handler({ permission: "inventory.damageLoss" }, async ({ req, user, ip }) => {
  const input = await body(req, lossSchema);
  const date = dateFromInput(input.date);

  return transaction(async (tx) => {
    if (input.approvedById) await assertApprover(tx, input.approvedById);
    const product = await lockProduct(tx, input.productId);

    const lossNo = await nextDocNumber(tx, "loss", date);
    const loss = await tx.stockLoss.create({
      data: {
        lossNo,
        type: input.type,
        date,
        productId: product.id,
        quantity: input.quantity,
        unitCost: product.avgCost, // written off at the average cost on the day
        reason: input.reason,
        location: input.location,
        remarks: input.remarks,
        attachmentUrl: input.attachmentUrl,
        attachmentPath: input.attachmentPath,
        approvedById: input.approvedById,
        createdById: user.id,
      },
    });
    await postStock(tx, {
      productId: product.id,
      type: input.type,
      quantity: input.quantity,
      date,
      refType: "StockLoss",
      refId: loss.id,
      refNo: lossNo,
      remarks: input.reason,
      userId: user.id,
    });

    await audit(tx, {
      userId: user.id,
      action: "CREATE",
      entity: "StockLoss",
      entityId: loss.id,
      summary: `${input.type === "LOST" ? "Lost" : "Damaged"} ${lossNo}: ${product.name} (${product.sku}) × ${input.quantity} — ${input.reason}`,
      after: loss,
      ip,
    });
    return loss;
  });
});
