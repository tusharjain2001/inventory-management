import { db, type Prisma } from "@/lib/db";
import { handler, listQuery, paged, spBool, spDateRange, spInt } from "@/lib/http";
import { displayStatusOf, invoiceScope, overdueWhere } from "@/lib/sales";

/**
 * ?q= (invoice no / customer) &customerId &salespersonId &status=ACTIVE|CANCELLED
 * &paymentStatus=UNPAID|PARTIALLY_PAID|PAID|CANCELLED|REFUNDED|OVERDUE &unpaid=true (active with a balance)
 * &from &to (invoice date) &sort=invoiceDate|dueDate|grandTotal|balanceDue|invoiceNo:dir
 */
export const GET = handler(
  { permission: ["invoices.view", "payments.view", "payments.record", "creditNotes.manage"] },
  async ({ req, user }) => {
    const lq = listQuery(req, ["invoiceDate", "dueDate", "grandTotal", "balanceDue", "invoiceNo"]);
    const sp = lq.sp;
    const ps = sp.get("paymentStatus");
    const status = sp.get("status");
    const range = spDateRange(sp);
    const where: Prisma.InvoiceWhereInput = {
      AND: [
        invoiceScope(user),
        ps === "OVERDUE" ? overdueWhere() : ps ? { paymentStatus: ps as Prisma.InvoiceWhereInput["paymentStatus"] } : {},
        status ? { status: status as Prisma.InvoiceWhereInput["status"] } : {},
        spBool(sp, "unpaid") ? { status: "ACTIVE", balanceDue: { gt: 0 } } : {},
        spInt(sp, "customerId") ? { customerId: spInt(sp, "customerId") } : {},
        spInt(sp, "salespersonId") ? { order: { salespersonId: spInt(sp, "salespersonId") } } : {},
        range ? { invoiceDate: range } : {},
        lq.q
          ? {
              OR: [
                { invoiceNo: { contains: lq.q, mode: "insensitive" } },
                { order: { customerName: { contains: lq.q, mode: "insensitive" } } },
                { order: { orderNo: { contains: lq.q, mode: "insensitive" } } },
                { customer: { mobile: { contains: lq.q } } },
              ],
            }
          : {},
      ],
    };
    const [rows, total, sums] = await Promise.all([
      db.invoice.findMany({
        where,
        orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }, { id: "desc" }] : [{ invoiceDate: "desc" }, { id: "desc" }],
        skip: lq.skip,
        take: lq.take,
        include: {
          order: {
            select: {
              id: true,
              orderNo: true,
              customerName: true,
              customerPhone: true,
              taxableTotal: true,
              taxTotal: true,
              salesperson: { select: { id: true, name: true } },
            },
          },
        },
      }),
      db.invoice.count({ where }),
      db.invoice.aggregate({
        where: { AND: [where, { status: "ACTIVE" }] },
        _sum: { grandTotal: true, amountPaid: true, balanceDue: true, creditNoteTotal: true },
      }),
    ]);
    return {
      ...paged(
        rows.map((r) => ({ ...r, displayStatus: displayStatusOf(r) })),
        total,
        lq,
      ),
      sums: sums._sum,
    };
  },
);
