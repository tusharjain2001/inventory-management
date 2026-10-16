import { db, transaction } from "@/lib/db";
import { body, handler, intParam, notFound } from "@/lib/http";
import { hideItemCost, orderSchema, orderScope, updateOrder } from "@/lib/sales";

export const GET = handler<{ id: string }>({ permission: "sales.view" }, async ({ params, user }) => {
  const id = intParam(params.id);
  const order = await db.salesOrder.findFirst({
    where: { id, ...orderScope(user) },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              currentStock: true,
              sellingPrice: true,
              gstRate: true,
              cessRate: true,
              taxType: true,
              taxInclusive: true,
              hsnCode: true,
              discountAllowed: true,
            },
          },
          overrideBy: { select: { name: true } },
        },
      },
      customer: true,
      salesperson: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      confirmedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      displayIssue: { select: { id: true, displayNo: true } },
      invoice: {
        select: { id: true, invoiceNo: true, invoiceDate: true, paymentStatus: true, status: true, balanceDue: true, dueDate: true },
      },
    },
  });
  if (!order) throw notFound("Order");
  return { ...order, items: hideItemCost(order.items, user) };
});

/** Edit a DRAFT order (same body as create, without action). */
export const PATCH = handler<{ id: string }>({ permission: "sales.edit" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, orderSchema);
  return transaction((tx) => updateOrder(tx, id, input, user, ip));
});
