import { db, type Prisma } from "@/lib/db";
import { badRequest, handler, spInt } from "@/lib/http";
import { round2, round3 } from "@/lib/calc";
import { describePeriod, num, periodWhere, REPORT_ROW_CAP, reportPeriod } from "@/lib/reports";

const STATUSES = ["UNPAID", "PAID"] as const;

/**
 * Consignment goods that have been sold, and what is owed to each supplier.
 * ?status=UNPAID|PAID &supplierId &from&to (sale date; default all dates).
 * Owed per line = quantity × the cost the goods left stock at (the supplier's price).
 */
export const GET = handler({ permission: "reports.purchase" }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const period = reportPeriod(sp, false);
  const status = sp.get("status");
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) throw badRequest("Invalid status");
  const supplierId = spInt(sp, "supplierId");

  const where: Prisma.SalesOrderItemWhereInput = {
    consignmentSupplierId: supplierId ?? { not: null },
    ...(status === "UNPAID" ? { consignmentSettlementId: null } : status === "PAID" ? { consignmentSettlementId: { not: null } } : {}),
    order: {
      // Unpaid lines of cancelled sales are not owed; paid ones stay visible so nothing disappears.
      ...(status === "PAID" ? {} : { status: { in: ["CONFIRMED", "INVOICED"] } }),
      ...(periodWhere(period) ? { orderDate: periodWhere(period) } : {}),
    },
  };

  const items = await db.salesOrderItem.findMany({
    where,
    take: REPORT_ROW_CAP,
    orderBy: [{ order: { orderDate: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      productId: true,
      sku: true,
      name: true,
      quantity: true,
      unitPrice: true,
      taxableValue: true,
      unitCost: true,
      consignmentSupplier: { select: { id: true, name: true } },
      consignmentSettlement: { select: { id: true, date: true, mode: true, reference: true } },
      order: {
        select: {
          id: true,
          orderNo: true,
          orderDate: true,
          status: true,
          customerName: true,
          invoice: { select: { id: true, invoiceNo: true, invoiceDate: true } },
        },
      },
    },
  });

  const rows = items.map((i) => {
    const quantity = num(i.quantity);
    const unitCost = round2(num(i.unitCost));
    return {
      id: i.id,
      saleDate: i.order.invoice?.invoiceDate ?? i.order.orderDate,
      orderId: i.order.id,
      orderNo: i.order.orderNo,
      invoiceId: i.order.invoice?.id ?? null,
      invoiceNo: i.order.invoice?.invoiceNo ?? "",
      orderStatus: i.order.status,
      customer: i.order.customerName,
      supplierId: i.consignmentSupplier!.id,
      supplier: i.consignmentSupplier!.name,
      productId: i.productId,
      product: i.name,
      sku: i.sku,
      quantity,
      saleValue: num(i.taxableValue),
      unitCost,
      payable: round2(quantity * unitCost),
      settlement: i.consignmentSettlement,
    };
  });

  // Per-supplier totals for the summary cards and table.
  const bySupplier = new Map<number, { supplierId: number; supplier: string; lines: number; quantity: number; saleValue: number; payable: number; paid: number; unpaid: number }>();
  for (const r of rows) {
    const s = bySupplier.get(r.supplierId) ?? { supplierId: r.supplierId, supplier: r.supplier, lines: 0, quantity: 0, saleValue: 0, payable: 0, paid: 0, unpaid: 0 };
    s.lines += 1;
    s.quantity = round3(s.quantity + r.quantity);
    s.saleValue = round2(s.saleValue + r.saleValue);
    s.payable = round2(s.payable + r.payable);
    if (r.settlement) s.paid = round2(s.paid + r.payable);
    else s.unpaid = round2(s.unpaid + r.payable);
    bySupplier.set(r.supplierId, s);
  }

  const sum = (k: "quantity" | "saleValue" | "payable") => round2(rows.reduce((s, r) => s + r[k], 0));
  const totals = {
    lines: rows.length,
    suppliers: bySupplier.size,
    quantity: sum("quantity"),
    saleValue: sum("saleValue"),
    payable: sum("payable"),
    paid: round2(rows.filter((r) => r.settlement).reduce((s, r) => s + r.payable, 0)),
    unpaid: round2(rows.filter((r) => !r.settlement).reduce((s, r) => s + r.payable, 0)),
  };

  return {
    rows,
    suppliers: [...bySupplier.values()].sort((a, b) => b.unpaid - a.unpaid || a.supplier.localeCompare(b.supplier)),
    totals,
    meta: { period: describePeriod(period), from: period.from, to: period.to },
  };
});
