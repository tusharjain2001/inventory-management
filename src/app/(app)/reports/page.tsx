"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Coins,
  Gauge,
  Landmark,
  PackageX,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { RequirePermission } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import type { Permission } from "@/lib/permissions";

type Card = { href: string; title: string; description: string; permission: Permission; icon: LucideIcon };

const GROUPS: { title: string; cards: Card[] }[] = [
  {
    title: "Stock",
    cards: [
      { href: "/reports/stock", title: "Stock Report", description: "Opening, in, out, display, damaged, lost and closing stock per product", permission: "reports.stock", icon: Boxes },
      { href: "/reports/low-stock", title: "Low Stock", description: "Items at or below their reorder level, with reorder quantities", permission: "reports.stock", icon: AlertTriangle },
      { href: "/reports/movement", title: "Fast / Slow Moving", description: "Sales velocity per product and days of stock left", permission: "reports.stock", icon: Gauge },
      { href: "/reports/dead-stock", title: "Dead Stock", description: "Items in stock with no sale for a long time", permission: "reports.valuation", icon: PackageX },
      { href: "/reports/valuation", title: "Inventory Valuation", description: "Stock value by category and product (weighted average)", permission: "reports.valuation", icon: Landmark },
    ],
  },
  {
    title: "Sales",
    cards: [
      { href: "/reports/sales", title: "Sales Report", description: "Invoice lines with discount and GST; group by invoice, product, customer, salesperson or day", permission: "reports.sales", icon: ShoppingCart },
    ],
  },
  {
    title: "Purchase",
    cards: [
      { href: "/reports/purchase", title: "Purchase Report", description: "Stock-in and purchase lines by supplier and product", permission: "reports.purchase", icon: Truck },
    ],
  },
  {
    title: "Finance",
    cards: [
      { href: "/reports/profit", title: "Profit Report", description: "Net revenue, cost of goods sold and gross margin", permission: "reports.profit", icon: TrendingUp },
      { href: "/reports/gst", title: "GST Report", description: "HSN and rate-wise summary, B2B / B2C invoices, credit notes, input GST", permission: "reports.gst", icon: Receipt },
      { href: "/reports/payments", title: "Payment Report", description: "Payments received and refunded, outstanding invoices with ageing", permission: "reports.payment", icon: Coins },
    ],
  },
];

export default function ReportsPage() {
  return (
    <RequirePermission
      permission={["reports.sales", "reports.stock", "reports.purchase", "reports.profit", "reports.gst", "reports.payment", "reports.valuation"]}
    >
      <ReportIndex />
    </RequirePermission>
  );
}

function ReportIndex() {
  const { can } = useSession();
  const groups = GROUPS.map((g) => ({ ...g, cards: g.cards.filter((c) => can(c.permission)) })).filter((g) => g.cards.length);
  return (
    <>
      <PageHeader title="Reports" description="Pick a report. Every report can be filtered, and exported to Excel, CSV or PDF." />
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{g.title}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.cards.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  className="group flex gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                    <c.icon className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium">{c.title}</div>
                    <p className="text-sm text-muted-foreground">{c.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ClipboardList className="size-3.5" />
        Sales figures use active invoices by invoice date (IST). Cancelled invoices are excluded.
      </p>
    </>
  );
}
