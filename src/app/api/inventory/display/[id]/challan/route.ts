import { handler, intParam } from "@/lib/http";
import { challanData } from "../../challan-data";

/** Everything the printed delivery (outward) challan needs: the display record, consignee details and our company details. */
export const GET = handler<{ id: string }>({ permission: "inventory.view" }, async ({ params }) => challanData(intParam(params.id)));
