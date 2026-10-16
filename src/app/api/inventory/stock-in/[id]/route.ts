import { db } from "@/lib/db";
import { handler, intParam, notFound } from "@/lib/http";
import { canSeePurchaseCost } from "../../shared";

/** One stock-in with its items. Stock-ins are immutable: corrections go through adjustments. */
export const GET = handler<{ id: string }>({ permission: ["inventory.stockIn", "purchases.view"] }, async ({ params, user }) => {
  const id = intParam(params.id);
  const stockIn = await db.stockIn.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, gstin: true, phone: true } },
      createdBy: { select: { id: true, name: true } },
      items: { orderBy: { id: "asc" }, include: { product: { select: { id: true, name: true, sku: true, hsnCode: true } } } },
    },
  });
  if (!stockIn) throw notFound("Stock-in");
  if (canSeePurchaseCost(user)) return stockIn;

  // Undefined keys are dropped from the JSON response.
  const hidden = { subtotal: undefined, discountTotal: undefined, taxableTotal: undefined, gstTotal: undefined, total: undefined };
  return {
    ...stockIn,
    ...hidden,
    items: stockIn.items.map((i) => ({
      ...i,
      unitCost: undefined,
      discountAmount: undefined,
      taxableValue: undefined,
      gstAmount: undefined,
      totalCost: undefined,
    })),
  };
});
