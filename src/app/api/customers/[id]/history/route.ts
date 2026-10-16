import { db, type Prisma } from "@/lib/db";
import { badRequest, forbidden, handler, intParam, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { hasAnyPermission, type Permission } from "@/lib/permissions";
import { effectivePaymentStatus, round2, round3 } from "@/lib/calc";
import { todayIST } from "@/lib/dates";

const TABS = ["invoices", "payments", "products", "display"] as const;
type Tab = (typeof TABS)[number];

/** Besides customers.view, each tab needs access to the underlying documents. */
const TAB_PERMISSIONS: Record<Tab, Permission[]> = {
  invoices: ["invoices.view", "sales.view"],
  payments: ["payments.view"],
  products: ["sales.view", "invoices.view"],
  display: ["inventory.view", "inventory.display"],
};

/**
 * Customer history lists.
 * ?tab=invoices|payments|products|display &from &to (YYYY-MM-DD) &productId &q &paymentStatus (incl. OVERDUE) &page &pageSize
 */
export const GET = handler<{ id: string }>({ permission: "customers.view" }, async ({ req, user, params }) => {
  const customerId = intParam(params.id);
  const lq = listQuery(req);
  const sp = lq.sp;
  const tab = (sp.get("tab") ?? "invoices") as Tab;
  if (!TABS.includes(tab)) throw badRequest("Unknown tab");
  if (!hasAnyPermission(user, TAB_PERMISSIONS[tab])) throw forbidden();

  const range = spDateRange(sp);
  const productId = spInt(sp, "productId");
  const q = lq.q;

  if (tab === "invoices") {
    const status = sp.get("paymentStatus");
    const startOfToday = new Date(`${todayIST()}T00:00:00+05:30`);
    const statusWhere: Prisma.InvoiceWhereInput =
      status === "OVERDUE"
        ? { status: "ACTIVE", paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] }, balanceDue: { gt: 0 }, dueDate: { lt: startOfToday } }
        : status === "CANCELLED"
          ? { status: "CANCELLED" }
          : status
            ? { status: "ACTIVE", paymentStatus: status as Prisma.InvoiceWhereInput["paymentStatus"] }
            : {};
    const where: Prisma.InvoiceWhereInput = {
      customerId,
      ...(range ? { invoiceDate: range } : {}),
      ...(q ? { invoiceNo: { contains: q, mode: "insensitive" } } : {}),
      ...(productId ? { order: { items: { some: { productId } } } } : {}),
      ...statusWhere,
    };
    const [rows, total, sums] = await Promise.all([
      db.invoice.findMany({
        where,
        orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
        skip: lq.skip,
        take: lq.take,
        select: {
          id: true,
          invoiceNo: true,
          invoiceDate: true,
          dueDate: true,
          orderId: true,
          order: { select: { orderNo: true } },
          grandTotal: true,
          amountPaid: true,
          creditNoteTotal: true,
          balanceDue: true,
          paymentStatus: true,
          status: true,
        },
      }),
      db.invoice.count({ where }),
      db.invoice.aggregate({
        // Totals count active invoices only.
        where: { AND: [where, { status: "ACTIVE" }] },
        _sum: { grandTotal: true, amountPaid: true, creditNoteTotal: true, balanceDue: true },
      }),
    ]);
    return {
      ...paged(
        rows.map(({ order, ...r }) => ({
          ...r,
          orderNo: order.orderNo,
          displayStatus: effectivePaymentStatus({
            paymentStatus: r.paymentStatus,
            dueDate: r.dueDate,
            balanceDue: r.balanceDue.toNumber(),
            status: r.status,
          }),
        })),
        total,
        lq,
      ),
      totals: {
        grandTotal: sums._sum.grandTotal?.toNumber() ?? 0,
        amountPaid: sums._sum.amountPaid?.toNumber() ?? 0,
        creditNoteTotal: sums._sum.creditNoteTotal?.toNumber() ?? 0,
        balanceDue: sums._sum.balanceDue?.toNumber() ?? 0,
      },
    };
  }

  if (tab === "payments") {
    const where: Prisma.PaymentWhereInput = {
      customerId,
      ...(range ? { paymentDate: range } : {}),
      ...(q
        ? {
            OR: [
              { paymentNo: { contains: q, mode: "insensitive" } },
              { reference: { contains: q, mode: "insensitive" } },
              { invoice: { invoiceNo: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(productId ? { invoice: { order: { items: { some: { productId } } } } } : {}),
    };
    const [rows, total, receipts, refunds] = await Promise.all([
      db.payment.findMany({
        where,
        orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
        skip: lq.skip,
        take: lq.take,
        select: {
          id: true,
          paymentNo: true,
          type: true,
          paymentDate: true,
          amount: true,
          mode: true,
          reference: true,
          notes: true,
          invoiceId: true,
          invoice: { select: { invoiceNo: true } },
          receivedBy: { select: { name: true } },
        },
      }),
      db.payment.count({ where }),
      db.payment.aggregate({ where: { ...where, type: "RECEIPT" }, _sum: { amount: true } }),
      db.payment.aggregate({ where: { ...where, type: "REFUND" }, _sum: { amount: true } }),
    ]);
    return {
      ...paged(
        rows.map(({ invoice, ...r }) => ({ ...r, invoiceNo: invoice.invoiceNo })),
        total,
        lq,
      ),
      totals: {
        received: receipts._sum.amount?.toNumber() ?? 0,
        refunded: refunds._sum.amount?.toNumber() ?? 0,
      },
    };
  }

  if (tab === "products") {
    // One customer's items are few, so aggregate in memory (needs the order date per item).
    const items = await db.salesOrderItem.findMany({
      where: {
        order: {
          customerId,
          status: { in: ["CONFIRMED", "INVOICED"] },
          ...(range ? { orderDate: range } : {}),
          ...(q
            ? {
                OR: [
                  { orderNo: { contains: q, mode: "insensitive" } },
                  { invoice: { invoiceNo: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        ...(productId ? { productId } : {}),
      },
      select: {
        productId: true,
        name: true,
        sku: true,
        quantity: true,
        taxableValue: true,
        lineTotal: true,
        order: { select: { orderDate: true } },
      },
    });
    type Agg = {
      productId: number;
      name: string;
      sku: string;
      totalQty: number;
      totalTaxable: number;
      totalValue: number;
      orders: number;
      lastPurchased: Date;
    };
    const map = new Map<number, Agg>();
    for (const it of items) {
      const date = it.order.orderDate;
      const a = map.get(it.productId);
      if (!a) {
        map.set(it.productId, {
          productId: it.productId,
          name: it.name,
          sku: it.sku,
          totalQty: it.quantity.toNumber(),
          totalTaxable: it.taxableValue.toNumber(),
          totalValue: it.lineTotal.toNumber(),
          orders: 1,
          lastPurchased: date,
        });
        continue;
      }
      a.totalQty = round3(a.totalQty + it.quantity.toNumber());
      a.totalTaxable = round2(a.totalTaxable + it.taxableValue.toNumber());
      a.totalValue = round2(a.totalValue + it.lineTotal.toNumber());
      a.orders += 1;
      if (date > a.lastPurchased) {
        a.lastPurchased = date;
        a.name = it.name;
        a.sku = it.sku;
      }
    }
    const all = [...map.values()].sort((x, y) => y.lastPurchased.getTime() - x.lastPurchased.getTime());
    return {
      ...paged(all.slice(lq.skip, lq.skip + lq.take), all.length, lq),
      totals: {
        totalQty: round3(all.reduce((s, a) => s + a.totalQty, 0)),
        totalTaxable: round2(all.reduce((s, a) => s + a.totalTaxable, 0)),
        totalValue: round2(all.reduce((s, a) => s + a.totalValue, 0)),
      },
    };
  }

  // display
  const status = sp.get("status");
  const where: Prisma.DisplayIssueWhereInput = {
    customerId,
    ...(range ? { date: range } : {}),
    ...(status ? { status: status as Prisma.DisplayIssueWhereInput["status"] } : {}),
    ...(q
      ? {
          OR: [
            { displayNo: { contains: q, mode: "insensitive" } },
            { locationName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(productId ? { items: { some: { productId } } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.displayIssue.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      select: {
        id: true,
        displayNo: true,
        date: true,
        locationName: true,
        expectedReturnDate: true,
        status: true,
        items: {
          select: {
            quantity: true,
            returnedQty: true,
            soldQty: true,
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    }),
    db.displayIssue.count({ where }),
  ]);
  return paged(
    rows.map(({ items, ...r }) => {
      const issued = round3(items.reduce((s, i) => s + i.quantity.toNumber(), 0));
      const returned = round3(items.reduce((s, i) => s + i.returnedQty.toNumber(), 0));
      const sold = round3(items.reduce((s, i) => s + i.soldQty.toNumber(), 0));
      return {
        ...r,
        itemCount: items.length,
        issuedQty: issued,
        returnedQty: returned,
        soldQty: sold,
        onDisplayQty: round3(issued - returned - sold),
        products: items.map((i) => ({
          ...i.product,
          onDisplay: round3(i.quantity.toNumber() - i.returnedQty.toNumber() - i.soldQty.toNumber()),
        })),
      };
    }),
    total,
    lq,
  );
});
