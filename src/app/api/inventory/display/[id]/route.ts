import { db } from "@/lib/db";
import { handler, intParam, notFound } from "@/lib/http";

/**
 * One display issue with per-item outstanding quantities.
 * Contract used by Sales to prefill an order from display stock (/sales/orders/new?displayId=):
 * { ...issue, customer: {id,name}|null, createdBy, items: [{ id, productId,
 *   product: {id,name,sku,sellingPrice,gstRate,hsnCode,taxType,cessRate,taxInclusive},
 *   quantity, returnedQty, soldQty, outstandingQty }], orders: [{ id, orderNo, status }] }
 */
export const GET = handler<{ id: string }>({ permission: ["inventory.view", "sales.create"] }, async ({ params }) => {
  const id = intParam(params.id);
  const issue = await db.displayIssue.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, mobile: true } },
      createdBy: { select: { id: true, name: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              sellingPrice: true,
              gstRate: true,
              hsnCode: true,
              taxType: true,
              cessRate: true,
              taxInclusive: true,
            },
          },
        },
      },
      orders: { orderBy: { id: "asc" }, select: { id: true, orderNo: true, status: true, orderDate: true, grandTotal: true } },
    },
  });
  if (!issue) throw notFound("Display record");

  const movements = await db.inventoryTransaction.findMany({
    where: { refType: "DisplayIssue", refId: id },
    orderBy: [{ txnDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      txnDate: true,
      type: true,
      quantity: true,
      remarks: true,
      product: { select: { id: true, name: true, sku: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return {
    ...issue,
    items: issue.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      product: i.product,
      quantity: i.quantity,
      returnedQty: i.returnedQty,
      soldQty: i.soldQty,
      outstandingQty: i.quantity.sub(i.returnedQty).sub(i.soldQty),
    })),
    movements,
  };
});
