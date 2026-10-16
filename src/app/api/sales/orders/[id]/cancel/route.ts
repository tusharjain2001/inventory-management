import { transaction } from "@/lib/db";
import { body, handler, intParam } from "@/lib/http";
import { cancelOrder, reasonSchema } from "@/lib/sales";

/** Cancels the order (and its invoice); confirmed stock goes back to the showroom. Body: { reason } */
export const POST = handler<{ id: string }>({ permission: "sales.cancel" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const { reason } = await body(req, reasonSchema);
  return transaction((tx) => cancelOrder(tx, id, reason, user, ip));
});
