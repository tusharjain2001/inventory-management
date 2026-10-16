import type { Permission } from "@/lib/permissions";

export type NavItem = { title: string; href: string; permission: Permission[] };
export type NavSection = { title: string | null; items: NavItem[] };

/** Sidebar navigation. An item shows if the user has ANY of its permissions. */
export const NAV: NavSection[] = [
  {
    title: null,
    items: [{ title: "Dashboard", href: "/", permission: ["dashboard.view"] }],
  },
  {
    title: "Sales",
    items: [
      { title: "Sales Orders", href: "/sales/orders", permission: ["sales.view"] },
      { title: "Invoices", href: "/sales/invoices", permission: ["invoices.view"] },
      { title: "Payments", href: "/sales/payments", permission: ["payments.view"] },
      { title: "Credit Notes", href: "/sales/credit-notes", permission: ["creditNotes.manage", "invoices.view"] },
      { title: "Customers", href: "/customers", permission: ["customers.view"] },
    ],
  },
  {
    title: "Inventory",
    items: [
      { title: "Products", href: "/products", permission: ["products.view"] },
      { title: "Stock Overview", href: "/inventory", permission: ["inventory.view"] },
      { title: "Stock In / Purchases", href: "/inventory/stock-in", permission: ["inventory.stockIn", "purchases.view"] },
      { title: "Potential Sales (Display)", href: "/inventory/display", permission: ["inventory.view"] },
      { title: "Adjustments", href: "/inventory/adjustments", permission: ["inventory.view"] },
      { title: "Damaged / Lost", href: "/inventory/losses", permission: ["inventory.view"] },
      { title: "Stock Ledger", href: "/inventory/ledger", permission: ["inventory.view"] },
      { title: "Suppliers", href: "/suppliers", permission: ["suppliers.view"] },
    ],
  },
  {
    title: "Reports",
    items: [
      {
        title: "All Reports",
        href: "/reports",
        permission: [
          "reports.sales",
          "reports.stock",
          "reports.purchase",
          "reports.profit",
          "reports.gst",
          "reports.payment",
          "reports.valuation",
        ],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      { title: "Users", href: "/admin/users", permission: ["users.view"] },
      { title: "Roles & Permissions", href: "/admin/roles", permission: ["roles.manage"] },
      { title: "Categories", href: "/admin/categories", permission: ["masters.manage"] },
      { title: "Settings", href: "/admin/settings", permission: ["settings.view"] },
      { title: "Audit Log", href: "/admin/audit", permission: ["audit.view"] },
      { title: "Login Activity", href: "/admin/login-activity", permission: ["audit.view"] },
    ],
  },
];
