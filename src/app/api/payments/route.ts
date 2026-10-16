import { db, transaction, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { createPayment, paymentSchema } from "@/lib/sales";

/** ?q= (payment no / invoice no / customer / reference) &invoiceId &customerId &mode &type=RECEIPT|REFUND &from &to */
export const GET = handler({ permission: "payments.view" }, async ({ req }) => {
  const lq = listQuery(req, ["paymentDate", "amount", "paymentNo"]);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const mode = sp.get("mode");
  const type = sp.get("type");
  const where: Prisma.PaymentWhereInput = {
    ...(spInt(sp, "invoiceId") ? { invoiceId: spInt(sp, "invoiceId") } : {}),
    ...(spInt(sp, "customerId") ? { customerId: spInt(sp, "customerId") } : {}),
    ...(mode ? { mode: mode as Prisma.PaymentWhereInput["mode"] } : {}),
    ...(type ? { type: type as Prisma.PaymentWhereInput["type"] } : {}),
    ...(range ? { paymentDate: range } : {}),
    ...(lq.q
      ? {
          OR: [
            { paymentNo: { contains: lq.q, mode: "insensitive" } },
            { reference: { contains: lq.q, mode: "insensitive" } },
            { invoice: { invoiceNo: { contains: lq.q, mode: "insensitive" } } },
            { invoice: { order: { customerName: { contains: lq.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [rows, total, sums] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }, { id: "desc" }] : [{ paymentDate: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: {
        invoice: { select: { id: true, invoiceNo: true, status: true, order: { select: { customerName: true } } } },
        receivedBy: { select: { id: true, name: true } },
      },
    }),
    db.payment.count({ where }),
    db.payment.groupBy({ by: ["type"], where, _sum: { amount: true } }),
  ]);
  const sum = (t: string) => sums.find((s) => s.type === t)?._sum.amount ?? 0;
  return { ...paged(rows, total, lq), sums: { receipts: sum("RECEIPT"), refunds: sum("REFUND") } };
});

/** Record a receipt or refund against an invoice. */
export const POST = handler({ permission: "payments.record" }, async ({ req, user, ip }) => {
  const input = await body(req, paymentSchema);
  return transaction((tx) => createPayment(tx, input, user, ip));
});
