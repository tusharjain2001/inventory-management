import { transaction } from "@/lib/db";
import { body, handler, intParam } from "@/lib/http";
import { deletePayment, paymentUpdateSchema, updatePayment } from "@/lib/sales";

export const PATCH = handler<{ id: string }>({ permission: "payments.edit" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, paymentUpdateSchema);
  return transaction((tx) => updatePayment(tx, id, input, user, ip));
});

export const DELETE = handler<{ id: string }>({ permission: "payments.edit" }, async ({ params, user, ip }) => {
  const id = intParam(params.id);
  return transaction((tx) => deletePayment(tx, id, user, ip));
});
