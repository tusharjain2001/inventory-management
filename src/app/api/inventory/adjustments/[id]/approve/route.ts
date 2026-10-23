import { transaction } from "@/lib/db";
import { handler, intParam } from "@/lib/http";
import { dateFromInput, todayIST } from "@/lib/dates";
import { applyAdjustment } from "../../apply";

/** Approves a pending stock adjustment; the stock moves today. */
export const POST = handler<{ id: string }>({ permission: "inventory.approve" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  return transaction((tx) => applyAdjustment(tx, id, user.id, ip, dateFromInput(todayIST())));
});
