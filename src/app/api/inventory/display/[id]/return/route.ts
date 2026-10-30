import { z } from "zod";
import { transaction } from "@/lib/db";
import { AppError, body, handler, intParam, notFound } from "@/lib/http";
import { audit } from "@/lib/audit";
import { postStock, refreshDisplayStatus } from "@/lib/inventory";
import { dateFromInput, istDateString } from "@/lib/dates";
import { nextDocNumber } from "@/lib/numbering";
import { idField, optText, pastDate, qtyField } from "../../../shared";

const returnSchema = z.object({
  date: pastDate("Return date").optional().nullable(),
  items: z
    .array(z.object({ itemId: idField("Invalid item"), quantity: qtyField }), { message: "Enter the quantity returned" })
    .min(1, "Enter the quantity returned for at least one item"),
  remarks: optText(1000),
});

/** Records stock coming back from a display location to the showroom, as a numbered inward challan. */
export const POST = handler<{ id: string }>({ permission: "inventory.display" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, returnSchema);
  const date = dateFromInput(input.date);

  return transaction(async (tx) => {
    // Lock the issue and its items so a concurrent return or sale (Sales locks the item rows
    // when confirming) cannot both pass the outstanding check.
    await tx.$queryRaw`SELECT id FROM "DisplayIssue" WHERE id = ${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "DisplayIssueItem" WHERE "displayIssueId" = ${id} ORDER BY id FOR UPDATE`;
    const issue = await tx.displayIssue.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { name: true, sku: true } } } } },
    });
    if (!issue) throw notFound("Display record");
    if (issue.status === "CLOSED") throw new AppError(400, `${issue.displayNo} is already closed`);
    if (istDateString(date) < istDateString(issue.date)) {
      throw new AppError(400, "Return date cannot be before the date the stock went out", { date: ["Check the return date"] });
    }

    const itemIds = input.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) throw new AppError(400, "An item is listed more than once");

    const lines = input.items.map((r) => {
      const item = issue.items.find((i) => i.id === r.itemId);
      if (!item) throw new AppError(400, "This item is not part of this display record");
      const outstanding = item.quantity.sub(item.returnedQty).sub(item.soldQty);
      if (outstanding.lt(r.quantity)) {
        throw new AppError(
          400,
          `${item.product.name} (${item.product.sku}): only ${outstanding.toNumber()} still out on display, cannot return ${r.quantity}`,
        );
      }
      return { item, quantity: r.quantity };
    });

    const returnNo = await nextDocNumber(tx, "displayReturn", date);
    const ret = await tx.displayReturn.create({
      data: {
        returnNo,
        displayIssueId: issue.id,
        date,
        remarks: input.remarks,
        createdById: user.id,
        items: { create: lines.map((l) => ({ displayIssueItemId: l.item.id, quantity: l.quantity })) },
      },
    });

    for (const { item, quantity } of lines) {
      await postStock(tx, {
        productId: item.productId,
        type: "DISPLAY_RETURN",
        quantity,
        date,
        refType: "DisplayIssue",
        refId: issue.id,
        refNo: returnNo,
        remarks: input.remarks ? `Returned from ${issue.locationName}: ${input.remarks}` : `Returned from ${issue.locationName}`,
        userId: user.id,
      });
      await tx.displayIssueItem.update({ where: { id: item.id }, data: { returnedQty: { increment: quantity } } });
    }
    const status = await refreshDisplayStatus(tx, issue.id);

    await audit(tx, {
      userId: user.id,
      action: "RETURN",
      entity: "DisplayIssue",
      entityId: issue.id,
      summary: `Display ${issue.displayNo}: inward challan ${returnNo}, returned ${lines
        .map((l) => `${l.item.product.sku} × ${l.quantity}`)
        .join(", ")} from ${issue.locationName}`,
      before: { status: issue.status },
      after: { status, items: input.items, remarks: input.remarks },
      ip,
    });
    return { ok: true, status, id: ret.id, returnNo };
  });
});
