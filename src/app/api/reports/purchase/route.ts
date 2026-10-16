import { db, type Prisma } from "@/lib/db";
import { badRequest, handler, spInt } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";
import { round2, round3 } from "@/lib/calc";
import { describePeriod, num, periodWhere, REPORT_ROW_CAP, reportPeriod } from "@/lib/reports";

const SOURCES = ["PURCHASE", "SUPPLIER_RECEIPT", "OPENING", "MANUAL"] as const;

/**
 * Stock-in (purchase) lines. ?from&to (default this month) &supplierId &productId &categoryId
 * &source=PURCHASE|SUPPLIER_RECEIPT|OPENING|MANUAL. Values need products.viewCost.
 */
export const GET = handler({ permission: "reports.purchase" }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const period = reportPeriod(sp);
  const showCost = hasPermission(user, "products.viewCost");
  const source = sp.get("source");
  if (source && !SOURCES.includes(source as (typeof SOURCES)[number])) throw badRequest("Invalid source");

  const where: Prisma.StockInItemWhereInput = {
    stockIn: {
      ...(periodWhere(period) ? { date: periodWhere(period) } : {}),
      ...(spInt(sp, "supplierId") ? { supplierId: spInt(sp, "supplierId") } : {}),
      ...(source ? { source: source as (typeof SOURCES)[number] } : {}),
    },
    ...(spInt(sp, "productId") ? { productId: spInt(sp, "productId") } : {}),
    ...(spInt(sp, "categoryId") ? { product: { categoryId: spInt(sp, "categoryId") } } : {}),
  };

  const items = await db.stockInItem.findMany({
    where,
    take: REPORT_ROW_CAP,
    orderBy: [{ stockIn: { date: "asc" } }, { stockInId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      quantity: true,
      unitCost: true,
      discountAmount: true,
      taxableValue: true,
      gstRate: true,
      gstAmount: true,
      totalCost: true,
      product: { select: { id: true, name: true, sku: true, category: { select: { name: true } } } },
      stockIn: {
        select: {
          id: true,
          stockInNo: true,
          date: true,
          source: true,
          purchaseInvoiceNo: true,
          supplier: { select: { id: true, name: true } },
        },
      },
    },
  });

  const rows = items.map((i) => ({
    id: i.id,
    stockInId: i.stockIn.id,
    stockInNo: i.stockIn.stockInNo,
    date: i.stockIn.date,
    source: i.stockIn.source,
    supplier: i.stockIn.supplier?.name ?? "",
    purchaseInvoiceNo: i.stockIn.purchaseInvoiceNo ?? "",
    productId: i.product.id,
    product: i.product.name,
    sku: i.product.sku,
    category: i.product.category.name,
    quantity: num(i.quantity),
    ...(showCost
      ? {
          unitCost: num(i.unitCost),
          discount: num(i.discountAmount),
          taxable: num(i.taxableValue),
          gstRate: num(i.gstRate),
          gst: num(i.gstAmount),
          total: num(i.totalCost),
        }
      : {}),
  }));

  const sum = (k: "discount" | "taxable" | "gst" | "total") => round2(rows.reduce((s, r) => s + (r[k] ?? 0), 0));
  const totals = {
    lines: rows.length,
    documents: new Set(rows.map((r) => r.stockInId)).size,
    suppliers: new Set(rows.map((r) => r.supplier).filter(Boolean)).size,
    quantity: round3(rows.reduce((s, r) => s + r.quantity, 0)),
    ...(showCost ? { discount: sum("discount"), taxable: sum("taxable"), gst: sum("gst"), total: sum("total") } : {}),
  };

  return { rows, totals, meta: { period: describePeriod(period), from: period.from, to: period.to, showCost } };
});
