import { db, transaction } from "@/lib/db";
import { body, handler, intParam, notFound } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { dateFromInput } from "@/lib/dates";
import { despatchSchema, getInvoiceDetail, invoiceScope } from "@/lib/sales";

/** Full invoice for the view and print pages (order lines, customer, payments, credit notes, HSN summary, words). */
export const GET = handler<{ id: string }>(
  { permission: ["invoices.view", "payments.view", "creditNotes.manage"] },
  async ({ params, user }) => getInvoiceDetail(intParam(params.id), user),
);

/** Only despatch / reference fields can change after issue — never amounts. */
export const PATCH = handler<{ id: string }>({ permission: "invoices.manage" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, despatchSchema);
  const before = await db.invoice.findFirst({ where: { id, ...invoiceScope(user) } });
  if (!before) throw notFound("Invoice");
  const data = { ...input, buyersOrderDate: input.buyersOrderDate ? dateFromInput(input.buyersOrderDate) : null };
  return transaction(async (tx) => {
    const updated = await tx.invoice.update({ where: { id }, data });
    const d = diff(before, data);
    if (d.changed) {
      await audit(tx, {
        userId: user.id,
        action: "UPDATE",
        entity: "Invoice",
        entityId: id,
        summary: `Updated despatch details on invoice ${before.invoiceNo}`,
        before: d.before,
        after: d.after,
        ip,
      });
    }
    return updated;
  });
});
