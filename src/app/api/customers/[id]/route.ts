import { db } from "@/lib/db";
import { AppError, body, handler, intParam } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { customerSchema } from "@/lib/validators";
import { stateByCode, stateByName, stateCodeFromGstin } from "@/lib/india";
import { customerStats } from "@/lib/customers";

/** Customer profile with summary stats (history lists come from /api/customers/[id]/history). */
export const GET = handler<{ id: string }>({ permission: ["customers.view", "sales.create"] }, async ({ params }) => {
  const id = intParam(params.id);
  const customer = await db.customer.findUniqueOrThrow({ where: { id }, include: { createdBy: { select: { name: true } } } });
  const stats = (await customerStats([id])).get(id);
  return { ...customer, stats };
});

export const PATCH = handler<{ id: string }>({ permission: "customers.edit" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, customerSchema);
  const stateCode = input.stateCode ?? stateCodeFromGstin(input.gstin) ?? stateByName(input.state)?.code ?? null;
  const data = { ...input, stateCode, state: input.state ?? stateByCode(stateCode)?.name ?? null };
  const before = await db.customer.findUniqueOrThrow({ where: { id } });
  if (before.isWalkIn && data.isActive === false) throw new AppError(400, "The walk-in (Cash) customer cannot be deactivated");
  const updated = await db.customer.update({ where: { id }, data });
  const d = diff(before, data);
  if (d.changed) {
    await audit(db, { userId: user.id, action: "UPDATE", entity: "Customer", entityId: id, summary: `Updated customer ${updated.name}`, before: d.before, after: d.after, ip });
  }
  return updated;
});

export const DELETE = handler<{ id: string }>({ permission: "customers.delete" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  const customer = await db.customer.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { orders: true, invoices: true, displayIssues: true } } },
  });
  if (customer.isWalkIn) throw new AppError(400, "The walk-in (Cash) customer cannot be deleted");
  if (customer._count.orders || customer._count.invoices || customer._count.displayIssues) {
    throw new AppError(409, `${customer.name} has sales history. Mark the customer inactive instead.`);
  }
  await db.customer.delete({ where: { id } });
  await audit(db, { userId: user.id, action: "DELETE", entity: "Customer", entityId: id, summary: `Deleted customer ${customer.name}`, before: customer, ip });
  return { ok: true };
});
