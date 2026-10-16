import { db, transaction, type Prisma } from "@/lib/db";
import { body, handler, listQuery, paged } from "@/lib/http";
import { audit } from "@/lib/audit";
import { customerSchema } from "@/lib/validators";
import { nextDocNumber } from "@/lib/numbering";
import { stateByCode, stateByName, stateCodeFromGstin } from "@/lib/india";
import { customerStats } from "@/lib/customers";

/** ?q= &type=CUSTOMER_TYPE &active=true|false|all (default true) &sort=name|code|createdAt:dir */
export const GET = handler({ permission: ["customers.view", "sales.create"] }, async ({ req }) => {
  const lq = listQuery(req, ["name", "code", "createdAt", "city"]);
  const active = lq.sp.get("active") ?? "true";
  const type = lq.sp.get("type");
  const where: Prisma.CustomerWhereInput = {
    ...(active === "all" ? {} : { isActive: active === "true" }),
    ...(type ? { customerType: type as Prisma.CustomerWhereInput["customerType"] } : {}),
    ...(lq.q
      ? {
          OR: [
            { name: { contains: lq.q, mode: "insensitive" } },
            { companyName: { contains: lq.q, mode: "insensitive" } },
            { mobile: { contains: lq.q } },
            { code: { contains: lq.q, mode: "insensitive" } },
            { gstin: { contains: lq.q, mode: "insensitive" } },
            { city: { contains: lq.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      // Walk-in "Cash" customer first so it is easy to pick at the counter.
      orderBy: lq.sort ? [{ [lq.sort.field]: lq.sort.dir }] : [{ isWalkIn: "desc" }, { name: "asc" }],
      skip: lq.skip,
      take: lq.take,
    }),
    db.customer.count({ where }),
  ]);
  const stats = await customerStats(rows.map((r) => r.id));
  return paged(
    rows.map((r) => ({ ...r, stats: stats.get(r.id) })),
    total,
    lq,
  );
});

export const POST = handler({ permission: "customers.create" }, async ({ req, user, ip }) => {
  const input = await body(req, customerSchema);
  const stateCode = input.stateCode ?? stateCodeFromGstin(input.gstin) ?? stateByName(input.state)?.code ?? null;
  const created = await transaction(async (tx) => {
    const code = await nextDocNumber(tx, "customer");
    const customer = await tx.customer.create({
      data: {
        ...input,
        stateCode,
        state: input.state ?? stateByCode(stateCode)?.name ?? null,
        code,
        createdById: user.id,
      },
    });
    await audit(tx, { userId: user.id, action: "CREATE", entity: "Customer", entityId: customer.id, summary: `Created customer ${customer.name} (${code})`, after: customer, ip });
    return customer;
  });
  return created;
});
