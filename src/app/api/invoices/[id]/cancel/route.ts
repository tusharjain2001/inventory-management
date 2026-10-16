import { db, transaction } from "@/lib/db";
import { body, handler, intParam, notFound } from "@/lib/http";
import { cancelOrder, invoiceScope, reasonSchema } from "@/lib/sales";

/** Cancels the invoice and its order (stock returns). Blocked while payments are held — refund first. */
export const POST = handler<{ id: string }>({ permission: "sales.cancel" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const { reason } = await body(req, reasonSchema);
  const inv = await db.invoice.findFirst({ where: { id, ...invoiceScope(user) }, select: { orderId: true } });
  if (!inv) throw notFound("Invoice");
  return transaction((tx) => cancelOrder(tx, inv.orderId, reason, user, ip));
});
