import { db, type Prisma } from "@/lib/db";
import { handler, listQuery, paged, spBool, spDateRange, spInt } from "@/lib/http";

/** Sign-in attempts, newest first. ?from&to &userId &success=true|false &q (identifier, IP, reason) */
export const GET = handler({ permission: "audit.view" }, async ({ req }) => {
  const lq = listQuery(req);
  const sp = lq.sp;
  const range = spDateRange(sp);
  const userId = spInt(sp, "userId");
  const success = spBool(sp, "success");
  const where: Prisma.LoginActivityWhereInput = {
    ...(range ? { createdAt: range } : {}),
    ...(userId ? { userId } : {}),
    ...(success !== undefined ? { success } : {}),
    ...(lq.q
      ? {
          OR: [
            { identifier: { contains: lq.q, mode: "insensitive" } },
            { ip: { contains: lq.q } },
            { reason: { contains: lq.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.loginActivity.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: lq.skip,
      take: lq.take,
      include: { user: { select: { id: true, name: true } } },
    }),
    db.loginActivity.count({ where }),
  ]);
  return paged(rows, total, lq);
});
