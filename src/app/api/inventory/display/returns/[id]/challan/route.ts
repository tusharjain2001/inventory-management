import { db } from "@/lib/db";
import { handler, intParam, notFound } from "@/lib/http";
import { challanData } from "../../../challan-data";

/** The printed inward challan for one return of display stock. */
export const GET = handler<{ id: string }>({ permission: "inventory.view" }, async ({ params }) => {
  const ret = await db.displayReturn.findUnique({ where: { id: intParam(params.id) }, include: { items: true } });
  if (!ret) throw notFound("Inward challan");
  const qty = new Map(ret.items.map((i) => [i.displayIssueItemId, i.quantity.toNumber()]));
  return challanData(ret.displayIssueId, { id: ret.id, returnNo: ret.returnNo, date: ret.date, remarks: ret.remarks, qty });
});
