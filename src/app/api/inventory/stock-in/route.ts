import { z } from "zod";
import { db, Prisma, transaction } from "@/lib/db";
import { AppError, body, handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { audit } from "@/lib/audit";
import { postStock } from "@/lib/inventory";
import { nextDocNumber } from "@/lib/numbering";
import { dateFromInput } from "@/lib/dates";
import { round2 } from "@/lib/calc";
import { formatAmount, formatINR } from "@/lib/format";
import { STOCK_IN_SOURCES } from "@/app/(app)/inventory/constants";
import { canSeePurchaseCost, idField, optDate, optId, optText, pastDate, qtyField, spEnum } from "../shared";

const itemSchema = z.object({
  productId: idField("Choose a product"),
  quantity: qtyField,
  unitCost: z.coerce.number({ message: "Enter the unit cost" }).min(0, "Unit cost cannot be negative"),
  discountAmount: z.coerce.number().min(0, "Discount cannot be negative").optional().nullable().transform((v) => v ?? 0),
  gstRate: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v) => (v === undefined || v === null || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), "GST % must be between 0 and 100"),
  batchNo: optText(60),
});

const stockInSchema = z
  .object({
    date: pastDate("Date"),
    source: z.enum(STOCK_IN_SOURCES, { message: "Choose a source" }),
    supplierId: optId,
    purchaseInvoiceNo: optText(60),
    purchaseInvoiceDate: optDate("Purchase invoice date"),
    remarks: optText(1000),
    updatePurchasePrice: z.boolean().optional().default(true),
    items: z.array(itemSchema, { message: "Add at least one item" }).min(1, "Add at least one item").max(500),
  })
  .refine((s) => s.source !== "PURCHASE" || s.supplierId, {
    message: "Choose the supplier for a purchase",
    path: ["supplierId"],
  });

/**
 * ?q= (stock-in no / purchase invoice no / supplier name) &supplierId &source &from&to
 * &sort=date|total:dir
 */
export const GET = handler({ permission: ["inventory.stockIn", "purchases.view"] }, async ({ req, user }) => {
  const lq = listQuery(req, ["date", "total"]);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const source = spEnum(sp, "source", STOCK_IN_SOURCES);
  const where: Prisma.StockInWhereInput = {
    ...(range ? { date: range } : {}),
    ...(source ? { source } : {}),
    ...(spInt(sp, "supplierId") ? { supplierId: spInt(sp, "supplierId") } : {}),
    ...(lq.q
      ? {
          OR: [
            { stockInNo: { contains: lq.q, mode: "insensitive" } },
            { purchaseInvoiceNo: { contains: lq.q, mode: "insensitive" } },
            { supplier: { name: { contains: lq.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.stockIn.findMany({
      where,
      orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }, { id: "desc" }] : [{ date: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: { select: { quantity: true } },
      },
    }),
    db.stockIn.count({ where }),
  ]);
  const showCost = canSeePurchaseCost(user);
  return paged(
    rows.map(({ items, subtotal, discountTotal, taxableTotal, gstTotal, total, ...r }) => ({
      ...r,
      itemCount: items.length,
      totalQty: items.reduce((s, i) => s + i.quantity.toNumber(), 0),
      ...(showCost ? { subtotal, discountTotal, taxableTotal, gstTotal, total } : {}),
    })),
    total,
    lq,
  );
});

export const POST = handler({ permission: "inventory.stockIn" }, async ({ req, user, ip }) => {
  const input = await body(req, stockInSchema);
  const date = dateFromInput(input.date);

  return transaction(async (tx) => {
    if (input.supplierId) {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new AppError(400, "Supplier not found", { supplierId: ["Choose a supplier"] });
    }

    const ids = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Line maths: taxable = qty × cost − discount; GST on taxable; total = taxable + GST.
    const lines = input.items.map((item, idx) => {
      const product = byId.get(item.productId);
      if (!product) throw new AppError(400, `Line ${idx + 1}: product not found`);
      if (product.deletedAt) throw new AppError(400, `Line ${idx + 1}: ${product.name} has been deleted`);
      const gross = round2(item.quantity * item.unitCost);
      const discount = round2(item.discountAmount);
      if (discount > gross) throw new AppError(400, `Line ${idx + 1}: discount cannot be more than the line amount (${formatINR(gross)})`);
      const gstRate = item.gstRate ?? product.gstRate.toNumber();
      const taxableValue = round2(gross - discount);
      const gstAmount = round2((taxableValue * gstRate) / 100);
      return {
        product,
        gross,
        data: {
          productId: product.id,
          quantity: item.quantity,
          unitCost: item.unitCost,
          discountAmount: discount,
          taxableValue,
          gstRate,
          gstAmount,
          totalCost: round2(taxableValue + gstAmount),
          batchNo: item.batchNo,
        },
      };
    });

    const sum = (f: (l: (typeof lines)[number]) => number) => round2(lines.reduce((s, l) => s + f(l), 0));
    const stockInNo = await nextDocNumber(tx, "stockIn", date);
    const stockIn = await tx.stockIn.create({
      data: {
        stockInNo,
        date,
        source: input.source,
        supplierId: input.supplierId,
        purchaseInvoiceNo: input.purchaseInvoiceNo,
        purchaseInvoiceDate: input.purchaseInvoiceDate ? dateFromInput(input.purchaseInvoiceDate) : null,
        remarks: input.remarks,
        subtotal: sum((l) => l.gross),
        discountTotal: sum((l) => l.data.discountAmount),
        taxableTotal: sum((l) => l.data.taxableValue),
        gstTotal: sum((l) => l.data.gstAmount),
        total: sum((l) => l.data.totalCost),
        createdById: user.id,
        items: { create: lines.map((l) => l.data) },
      },
    });

    // Post in product-id order so concurrent stock-ins lock rows in the same order.
    const type = input.source === "OPENING" ? "OPENING" : "STOCK_IN";
    const priceChanges: string[] = [];
    for (const l of [...lines].sort((a, b) => a.product.id - b.product.id)) {
      // Cost excluding GST, net of discount; this is what the weighted average uses.
      const netUnitCost = new Prisma.Decimal(l.data.taxableValue).div(l.data.quantity);
      await postStock(tx, {
        productId: l.product.id,
        type,
        quantity: l.data.quantity,
        unitCost: netUnitCost,
        date,
        refType: "StockIn",
        refId: stockIn.id,
        refNo: stockInNo,
        remarks: input.purchaseInvoiceNo ? `Purchase invoice ${input.purchaseInvoiceNo}` : input.remarks,
        userId: user.id,
      });
      if (input.updatePurchasePrice) {
        const newPrice = netUnitCost.toDecimalPlaces(2);
        if (!newPrice.eq(l.product.purchasePrice)) {
          await tx.product.update({ where: { id: l.product.id }, data: { purchasePrice: newPrice } });
          priceChanges.push(`${l.product.sku}: ${l.product.purchasePrice.toNumber()} to ${newPrice.toNumber()}`);
        }
      }
    }

    await audit(tx, {
      userId: user.id,
      action: "CREATE",
      entity: "StockIn",
      entityId: stockIn.id,
      summary: `Stock in ${stockInNo}: ${lines.length} item(s), total Rs. ${formatAmount(stockIn.total.toNumber())}${
        priceChanges.length ? ` — purchase price updated for ${priceChanges.length} product(s)` : ""
      }`,
      after: { ...stockIn, items: lines.map((l) => l.data), priceChanges },
      ip,
    });
    return stockIn;
  });
});
