import { db, type DbOrTx } from "@/lib/db";
import { round2 } from "@/lib/calc";

export type CustomerStats = {
  totalOrders: number;
  totalPurchases: number;
  lastPurchaseDate: Date | null;
  averageOrderValue: number;
  outstanding: number;
};

/** Sales stats per customer from active (non-cancelled) invoices; outstanding includes the opening balance. */
export async function customerStats(ids: number[], client: DbOrTx = db): Promise<Map<number, CustomerStats>> {
  const out = new Map<number, CustomerStats>();
  if (!ids.length) return out;
  const [agg, customers] = await Promise.all([
    client.invoice.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids }, status: "ACTIVE" },
      _sum: { grandTotal: true, balanceDue: true, creditNoteTotal: true },
      _count: { _all: true },
      _max: { invoiceDate: true },
    }),
    client.customer.findMany({ where: { id: { in: ids } }, select: { id: true, openingBalance: true } }),
  ]);
  const byId = new Map(agg.map((a) => [a.customerId, a]));
  for (const c of customers) {
    const a = byId.get(c.id);
    const total = round2((a?._sum.grandTotal?.toNumber() ?? 0) - (a?._sum.creditNoteTotal?.toNumber() ?? 0));
    const count = a?._count._all ?? 0;
    out.set(c.id, {
      totalOrders: count,
      totalPurchases: total,
      lastPurchaseDate: a?._max.invoiceDate ?? null,
      averageOrderValue: count ? round2(total / count) : 0,
      outstanding: round2((a?._sum.balanceDue?.toNumber() ?? 0) + c.openingBalance.toNumber()),
    });
  }
  return out;
}
