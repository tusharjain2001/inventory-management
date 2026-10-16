import { transaction } from "@/lib/db";
import { body, handler, intParam } from "@/lib/http";
import { invoiceActionSchema, invoiceOrder } from "@/lib/sales";

/** Issues the invoice (confirms the order first if it is still a draft). Body: invoiceDate + despatch fields. */
export const POST = handler<{ id: string }>({ permission: "sales.create" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, invoiceActionSchema);
  return transaction((tx) => invoiceOrder(tx, id, input, user, ip));
});
