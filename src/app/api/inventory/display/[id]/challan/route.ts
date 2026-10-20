import { db } from "@/lib/db";
import { handler, intParam, notFound } from "@/lib/http";
import { getSettingsGroup } from "@/lib/settings";
import { amountInWords } from "@/lib/format";

/** Everything the printed delivery challan needs: the display record, consignee details and our company details. */
export const GET = handler<{ id: string }>({ permission: "inventory.view" }, async ({ params }) => {
  const id = intParam(params.id);
  const [issue, company] = await Promise.all([
    db.displayIssue.findUnique({
      where: { id },
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

  const items = issue.items.map((i) => {
    const rate = (i.unitPrice ?? i.product.sellingPrice).toNumber();
    const quantity = i.quantity.toNumber();
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
    id: issue.id,
    challanNo: issue.displayNo,
    date: issue.date,
    status: issue.status,
    expectedReturnDate: issue.expectedReturnDate,
    locationName: issue.locationName,
    address: issue.address,
    contactPerson: issue.contactPerson,
    contactPhone: issue.contactPhone,
    remarks: issue.remarks,
    customer: issue.customer && !issue.customer.isWalkIn ? issue.customer : null,
    company,
    items,
    totalQty: items.reduce((s, i) => s + i.quantity, 0),
    totalValue,
    totalInWords: amountInWords(totalValue),
  };
});
