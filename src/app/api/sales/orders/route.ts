import { db, transaction, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { createOrder, createOrderSchema, invoiceOrder, orderScope } from "@/lib/sales";

/**
 * ?q= (order no / customer) &status=DRAFT|CONFIRMED|INVOICED|CANCELLED &customerId &salespersonId
 * &from &to (order date) &sort=orderDate|grandTotal|orderNo:dir
 */
export const GET = handler({ permission: "sales.view" }, async ({ req, user }) => {
  const lq = listQuery(req, ["orderDate", "grandTotal", "orderNo", "createdAt"]);
  const sp = lq.sp;
  const status = sp.get("status");
  const range = spDateRange(sp);
  const where: Prisma.SalesOrderWhereInput = {
    AND: [
      orderScope(user),
      status ? { status: status as Prisma.SalesOrderWhereInput["status"] } : {},
      spInt(sp, "customerId") ? { customerId: spInt(sp, "customerId") } : {},
      spInt(sp, "salespersonId") ? { salespersonId: spInt(sp, "salespersonId") } : {},
      range ? { orderDate: range } : {},
      lq.q
        ? {
            OR: [
              { orderNo: { contains: lq.q, mode: "insensitive" } },
              { customerName: { contains: lq.q, mode: "insensitive" } },
              { customerPhone: { contains: lq.q } },
              { invoice: { invoiceNo: { contains: lq.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [rows, total, sums] = await Promise.all([
    db.salesOrder.findMany({
      where,
      orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }, { id: "desc" }] : [{ orderDate: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: {
        invoice: { select: { id: true, invoiceNo: true, paymentStatus: true, status: true, balanceDue: true } },
        salesperson: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.salesOrder.count({ where }),
    db.salesOrder.aggregate({ where: { AND: [where, { status: { not: "CANCELLED" } }] }, _sum: { grandTotal: true } }),
  ]);
  return { ...paged(rows, total, lq), sumGrandTotal: sums._sum.grandTotal ?? 0 };
});

/** Creates an order. action "invoice" = Save & Invoice: create, confirm (stock out) and invoice in one transaction. */
export const POST = handler({ permission: "sales.create" }, async ({ req, user, ip }) => {
  const input = await body(req, createOrderSchema);
  return transaction(async (tx) => {
    const { order, warnings } = await createOrder(tx, input, user, ip);
    if (input.action !== "invoice") return { order, invoice: null, warnings };
    const invoice = await invoiceOrder(tx, order.id, input.invoice, user, ip);
    const fresh = await tx.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    return { order: fresh, invoice, warnings };
  });
});
