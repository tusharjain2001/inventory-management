import { db } from "@/lib/db";
import { AppError, body, handler, intParam } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { supplierSchema } from "@/lib/validators";
import { stateByCode, stateCodeFromGstin } from "@/lib/india";

export const GET = handler<{ id: string }>({ permission: ["suppliers.view", "inventory.stockIn"] }, async ({ params }) => {
  const id = intParam(params.id);
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id } });
  const [recentStockIns, totals, productCount] = await Promise.all([
    db.stockIn.findMany({
      where: { supplierId: id },
      orderBy: { date: "desc" },
      take: 20,
      select: { id: true, stockInNo: true, date: true, purchaseInvoiceNo: true, total: true, _count: { select: { items: true } } },
    }),
    db.stockIn.aggregate({ where: { supplierId: id }, _sum: { total: true }, _count: true, _max: { date: true } }),
    db.product.count({ where: { preferredSupplierId: id, deletedAt: null } }),
  ]);
  return {
    ...supplier,
    stats: {
      purchases: totals._count,
      purchaseValue: totals._sum.total?.toNumber() ?? 0,
      lastPurchaseDate: totals._max.date,
      preferredForProducts: productCount,
    },
    recentStockIns,
  };
});

export const PATCH = handler<{ id: string }>({ permission: "suppliers.manage" }, async ({ req, user, params, ip }) => {
  const id = intParam(params.id);
  const input = await body(req, supplierSchema);
  const stateCode = input.stateCode ?? stateCodeFromGstin(input.gstin) ?? null;
  const data = { ...input, stateCode, state: input.state ?? stateByCode(stateCode)?.name ?? null };
  const before = await db.supplier.findUniqueOrThrow({ where: { id } });
  const updated = await db.supplier.update({ where: { id }, data });
  const d = diff(before, data);
  if (d.changed) {
    await audit(db, { userId: user.id, action: "UPDATE", entity: "Supplier", entityId: id, summary: `Updated supplier ${updated.name}`, before: d.before, after: d.after, ip });
  }
  return updated;
});

export const DELETE = handler<{ id: string }>({ permission: "suppliers.manage" }, async ({ user, params, ip }) => {
  const id = intParam(params.id);
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id }, include: { _count: { select: { stockIns: true } } } });
  if (supplier._count.stockIns > 0) {
    throw new AppError(409, `${supplier.name} has purchase records. Mark the supplier inactive instead.`);
  }
  const consignment = await db.product.count({ where: { preferredSupplierId: id, sourceType: "CONSIGNMENT", deletedAt: null } });
  const consignmentSales = await db.salesOrderItem.count({ where: { consignmentSupplierId: id } });
  if (consignment > 0 || consignmentSales > 0) {
    throw new AppError(409, `${supplier.name} has consignment products or sales. Mark the supplier inactive instead.`);
  }
  await db.$transaction([
    db.product.updateMany({ where: { preferredSupplierId: id }, data: { preferredSupplierId: null } }),
    db.supplier.delete({ where: { id } }),
  ]);
  await audit(db, { userId: user.id, action: "DELETE", entity: "Supplier", entityId: id, summary: `Deleted supplier ${supplier.name}`, before: supplier, ip });
  return { ok: true };
});
