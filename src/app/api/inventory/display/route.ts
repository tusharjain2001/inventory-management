import { z } from "zod";
import { db, transaction, type Prisma } from "@/lib/db";
import { AppError, body, handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { audit } from "@/lib/audit";
import { postStock } from "@/lib/inventory";
import { nextDocNumber } from "@/lib/numbering";
import { dateFromInput } from "@/lib/dates";
import { DISPLAY_STATUSES } from "@/app/(app)/inventory/constants";
import { idField, optDate, optId, optText, pastDate, qtyField, spEnum } from "../shared";

const displaySchema = z.object({
  date: pastDate("Date"),
  customerId: optId,
  locationName: z.string({ message: "Location name is required" }).trim().min(1, "Location name is required").max(200),
  address: optText(500),
  contactPerson: optText(100),
  contactPhone: optText(30),
  expectedReturnDate: optDate("Expected return date"),
  remarks: optText(1000),
  items: z
    .array(z.object({ productId: idField("Choose a product"), quantity: qtyField }), { message: "Add at least one item" })
    .min(1, "Add at least one item")
    .max(200),
});

/** ?q= (display no / location / customer) &status=OUT|PARTIAL|CLOSED|OPEN (OUT+PARTIAL) &customerId &from&to &sort=date:dir */
export const GET = handler({ permission: "inventory.view" }, async ({ req }) => {
  const lq = listQuery(req, ["date", "expectedReturnDate"]);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const status: Prisma.DisplayIssueWhereInput["status"] =
    sp.get("status") === "OPEN" ? { in: ["OUT", "PARTIAL"] } : spEnum(sp, "status", DISPLAY_STATUSES);
  const where: Prisma.DisplayIssueWhereInput = {
    ...(range ? { date: range } : {}),
    ...(status ? { status } : {}),
    ...(spInt(sp, "customerId") ? { customerId: spInt(sp, "customerId") } : {}),
    ...(lq.q
      ? {
          OR: [
            { displayNo: { contains: lq.q, mode: "insensitive" } },
            { locationName: { contains: lq.q, mode: "insensitive" } },
            { contactPerson: { contains: lq.q, mode: "insensitive" } },
            { customer: { name: { contains: lq.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.displayIssue.findMany({
      where,
      orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }, { id: "desc" }] : [{ date: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: {
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: { select: { quantity: true, returnedQty: true, soldQty: true } },
      },
    }),
    db.displayIssue.count({ where }),
  ]);
  return paged(
    rows.map(({ items, ...r }) => {
      const n = (f: (i: (typeof items)[number]) => Prisma.Decimal) => items.reduce((s, i) => s + f(i).toNumber(), 0);
      return {
        ...r,
        itemCount: items.length,
        totalQty: n((i) => i.quantity),
        returnedQty: n((i) => i.returnedQty),
        soldQty: n((i) => i.soldQty),
        outstandingQty: n((i) => i.quantity.sub(i.returnedQty).sub(i.soldQty)),
      };
    }),
    total,
    lq,
  );
});

export const POST = handler({ permission: "inventory.display" }, async ({ req, user, ip }) => {
  const input = await body(req, displaySchema);
  const date = dateFromInput(input.date);

  return transaction(async (tx) => {
    if (input.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new AppError(400, "Customer not found", { customerId: ["Choose a customer"] });
    }
    const ids = input.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) throw new AppError(400, "A product is listed more than once. Combine the quantities into one line.");
    const products = await tx.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const [idx, item] of input.items.entries()) {
      const p = byId.get(item.productId);
      if (!p || p.deletedAt) throw new AppError(400, `Line ${idx + 1}: product not found`);
      if (!p.isActive) throw new AppError(400, `${p.name} (${p.sku}) is inactive and cannot be sent for display`);
    }

    const displayNo = await nextDocNumber(tx, "display", date);
    const issue = await tx.displayIssue.create({
      data: {
        displayNo,
        date,
        customerId: input.customerId,
        locationName: input.locationName,
        address: input.address,
        contactPerson: input.contactPerson,
        contactPhone: input.contactPhone,
        expectedReturnDate: input.expectedReturnDate ? dateFromInput(input.expectedReturnDate) : null,
        remarks: input.remarks,
        createdById: user.id,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: byId.get(i.productId)!.sellingPrice,
          })),
        },
      },
    });

    // Moves stock from the showroom to "on display"; blocks if the showroom does not have it.
    for (const item of [...input.items].sort((a, b) => a.productId - b.productId)) {
      await postStock(tx, {
        productId: item.productId,
        type: "DISPLAY_OUT",
        quantity: item.quantity,
        date,
        refType: "DisplayIssue",
        refId: issue.id,
        refNo: displayNo,
        remarks: `Display at ${input.locationName}`,
        userId: user.id,
      });
    }

    await audit(tx, {
      userId: user.id,
      action: "CREATE",
      entity: "DisplayIssue",
      entityId: issue.id,
      summary: `Display ${displayNo}: ${input.items.length} item(s) sent to ${input.locationName}`,
      after: { ...issue, items: input.items },
      ip,
    });
    return issue;
  });
});
