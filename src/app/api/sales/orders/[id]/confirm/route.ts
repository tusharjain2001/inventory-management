import { transaction } from "@/lib/db";
import { handler, intParam } from "@/lib/http";
import { confirmOrder } from "@/lib/sales";

/** DRAFT → CONFIRMED (stock goes out). */
export const POST = handler<{ id: string }>({ permission: ["sales.create", "sales.edit"] }, async ({ params, user, ip }) => {
  const id = intParam(params.id);
  return transaction((tx) => confirmOrder(tx, id, user, ip));
});
