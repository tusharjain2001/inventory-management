import { db, transaction, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged, spDateRange, spInt } from "@/lib/http";
import { createCreditNote, creditNoteSchema, invoiceScope } from "@/lib/sales";

/** ?q= (credit note no / invoice no / customer) &invoiceId &customerId &status=ACTIVE|CANCELLED &from &to */
export const GET = handler({ permission: ["creditNotes.manage", "invoices.view"] }, async ({ req, user }) => {
  const lq = listQuery(req, ["date", "total", "creditNoteNo"]);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const status = sp.get("status");
  const where: Prisma.CreditNoteWhereInput = {
    invoice: invoiceScope(user),
    ...(spInt(sp, "invoiceId") ? { invoiceId: spInt(sp, "invoiceId") } : {}),
    ...(spInt(sp, "customerId") ? { customerId: spInt(sp, "customerId") } : {}),
    ...(status ? { status: status as Prisma.CreditNoteWhereInput["status"] } : {}),
    ...(range ? { date: range } : {}),
    ...(lq.q
      ? {
          OR: [
            { creditNoteNo: { contains: lq.q, mode: "insensitive" } },
            { invoice: { invoiceNo: { contains: lq.q, mode: "insensitive" } } },
            { invoice: { order: { customerName: { contains: lq.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.creditNote.findMany({
      where,
      orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }, { id: "desc" }] : [{ date: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: {
        invoice: { select: { id: true, invoiceNo: true, order: { select: { customerName: true } } } },
        createdBy: { select: { name: true } },
      },
    }),
    db.creditNote.count({ where }),
  ]);
  return paged(rows, total, lq);
});

/** Financial-only credit note against an active invoice (no stock movement). */
export const POST = handler({ permission: "creditNotes.manage" }, async ({ req, user, ip }) => {
  const input = await body(req, creditNoteSchema);
  return transaction((tx) => createCreditNote(tx, input, user, ip));
});
