import { db } from "@/lib/db";
import { notFound } from "@/lib/http";
import { getSettingsGroup } from "@/lib/settings";
import { amountInWords } from "@/lib/format";

/**
 * Data for a printed display challan. Outward (stock sent out) prints every item of the display record;
 * inward (a return) prints only what came back on that return.
 */
export async function challanData(issueId: number, ret?: { id: number; returnNo: string; date: Date; remarks: string | null; qty: Map<number, number> }) {
  const [issue, company] = await Promise.all([
    db.displayIssue.findUnique({
      where: { id: issueId },
      include: {
        customer: {
          select: {
            name: true,
            companyName: true,
            mobile: true,
            gstin: true,
            billingAddress: true,
            city: true,
            state: true,
            stateCode: true,
            pincode: true,
            isWalkIn: true,
          },
        },
        items: {
          orderBy: { id: "asc" },
          include: { product: { select: { name: true, sku: true, hsnCode: true, gstRate: true, sellingPrice: true } } },
        },
      },
    }),
    getSettingsGroup("company"),
  ]);
  if (!issue) throw notFound("Display record");

  const items = issue.items
    .filter((i) => !ret || ret.qty.has(i.id))
    .map((i) => {
      const rate = (i.unitPrice ?? i.product.sellingPrice).toNumber();
      const quantity = ret ? ret.qty.get(i.id)! : i.quantity.toNumber();
      return {
        id: i.id,
        name: i.product.name,
        sku: i.product.sku,
        hsnCode: i.product.hsnCode,
        gstRate: i.product.gstRate.toNumber(),
        quantity,
        rate,
        value: Math.round(rate * quantity * 100) / 100,
      };
    });
  const totalValue = items.reduce((s, i) => s + i.value, 0);

  return {
    id: ret?.id ?? issue.id,
    kind: ret ? ("INWARD" as const) : ("OUTWARD" as const),
    challanNo: ret?.returnNo ?? issue.displayNo,
    date: ret?.date ?? issue.date,
    against: ret ? { challanNo: issue.displayNo, date: issue.date } : null,
    status: issue.status,
    expectedReturnDate: issue.expectedReturnDate,
    locationName: issue.locationName,
    address: issue.address,
    contactPerson: issue.contactPerson,
    contactPhone: issue.contactPhone,
    remarks: ret ? ret.remarks : issue.remarks,
    customer: issue.customer && !issue.customer.isWalkIn ? issue.customer : null,
    company,
    items,
    totalQty: items.reduce((s, i) => s + i.quantity, 0),
    totalValue,
    totalInWords: amountInWords(totalValue),
  };
}
