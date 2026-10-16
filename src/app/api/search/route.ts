import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";

const LIMIT = 6;

/** Global search across products, customers, invoices, orders and suppliers (respects permissions). */
export const GET = handler({}, async ({ req, user }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return { groups: [] };
  const contains = { contains: q, mode: "insensitive" as const };
  const groups: { label: string; hits: { id: number; title: string; subtitle?: string; href: string }[] }[] = [];

  const tasks: Promise<void>[] = [];
  if (hasPermission(user, "products.view")) {
    tasks.push(
      db.product
        .findMany({
          where: { deletedAt: null, OR: [{ name: contains }, { sku: contains }] },
          take: LIMIT,
          orderBy: { name: "asc" },
          select: { id: true, name: true, sku: true, currentStock: true },
        })
        .then((rows) => {
          groups.push({
            label: "Products",
            hits: rows.map((p) => ({
              id: p.id,
              title: p.name,
              subtitle: `${p.sku} · Stock ${p.currentStock.toNumber()}`,
              href: `/products/${p.id}`,
            })),
          });
        }),
    );
  }
  if (hasPermission(user, "customers.view")) {
    tasks.push(
      db.customer
        .findMany({
          where: { OR: [{ name: contains }, { mobile: contains }, { companyName: contains }, { code: contains }, { gstin: contains }] },
          take: LIMIT,
          orderBy: { name: "asc" },
          select: { id: true, name: true, mobile: true, code: true },
        })
        .then((rows) => {
          groups.push({
            label: "Customers",
            hits: rows.map((c) => ({
              id: c.id,
              title: c.name,
              subtitle: [c.code, c.mobile].filter(Boolean).join(" · "),
              href: `/customers/${c.id}`,
            })),
          });
        }),
    );
  }
  if (hasPermission(user, "invoices.view")) {
    tasks.push(
      db.invoice
        .findMany({
          where: { OR: [{ invoiceNo: contains }, { order: { customerName: contains } }] },
          take: LIMIT,
          orderBy: { invoiceDate: "desc" },
          select: { id: true, invoiceNo: true, grandTotal: true, order: { select: { customerName: true } } },
        })
        .then((rows) => {
          groups.push({
            label: "Invoices",
            hits: rows.map((i) => ({
              id: i.id,
              title: i.invoiceNo,
              subtitle: `${i.order.customerName} · ₹${i.grandTotal.toNumber().toLocaleString("en-IN")}`,
              href: `/sales/invoices/${i.id}`,
            })),
          });
        }),
    );
  }
  if (hasPermission(user, "sales.view")) {
    const own = hasPermission(user, "sales.viewAll") ? {} : { OR: [{ salespersonId: user.id }, { createdById: user.id }] };
    tasks.push(
      db.salesOrder
        .findMany({
          where: { AND: [own, { OR: [{ orderNo: contains }, { customerName: contains }] }] },
          take: LIMIT,
          orderBy: { orderDate: "desc" },
          select: { id: true, orderNo: true, customerName: true, status: true },
        })
        .then((rows) => {
          groups.push({
            label: "Sales Orders",
            hits: rows.map((o) => ({ id: o.id, title: o.orderNo, subtitle: `${o.customerName} · ${o.status}`, href: `/sales/orders/${o.id}` })),
          });
        }),
    );
  }
  if (hasPermission(user, "suppliers.view")) {
    tasks.push(
      db.supplier
        .findMany({
          where: { OR: [{ name: contains }, { phone: contains }, { gstin: contains }] },
          take: LIMIT,
          orderBy: { name: "asc" },
          select: { id: true, name: true, phone: true },
        })
        .then((rows) => {
          groups.push({
            label: "Suppliers",
            hits: rows.map((s) => ({ id: s.id, title: s.name, subtitle: s.phone ?? undefined, href: `/suppliers/${s.id}` })),
          });
        }),
    );
  }
  await Promise.all(tasks);
  const order = ["Products", "Customers", "Invoices", "Sales Orders", "Suppliers"];
  groups.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  return { groups };
});
