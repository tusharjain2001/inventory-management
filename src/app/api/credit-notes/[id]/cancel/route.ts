import { transaction } from "@/lib/db";
import { body, handler, intParam } from "@/lib/http";
import { cancelCreditNote, reasonSchema } from "@/lib/sales";

export const POST = handler<{ id: string }>({ permission: "creditNotes.manage" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const { reason } = await body(req, reasonSchema);
  return transaction((tx) => cancelCreditNote(tx, id, reason, user, ip));
});
