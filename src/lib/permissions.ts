// Permission catalog shared by server and client. Roles store a list of these keys;
// the ADMIN role implicitly has every permission (including ones added later).

export const PERMISSION_GROUPS = [
  {
    group: "Dashboard",
    items: [
      { key: "dashboard.view", label: "View dashboard" },
      { key: "dashboard.financials", label: "See stock value and profit figures" },
    ],
  },
  {
    group: "Products & masters",
    items: [
      { key: "products.view", label: "View products" },
      { key: "products.create", label: "Add products" },
      { key: "products.edit", label: "Edit products" },
      { key: "products.delete", label: "Delete products" },
      { key: "products.viewCost", label: "See purchase price / cost" },
      { key: "products.editCost", label: "Change purchase price" },
      { key: "masters.manage", label: "Manage categories & sub-categories" },
      { key: "suppliers.view", label: "View suppliers" },
      { key: "suppliers.manage", label: "Add / edit suppliers" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { key: "inventory.view", label: "View stock and stock movements" },
      { key: "inventory.stockIn", label: "Record stock-in / purchases" },
      { key: "inventory.adjust", label: "Adjust stock" },
      { key: "inventory.damageLoss", label: "Record damaged / lost stock" },
      { key: "inventory.display", label: "Send / return stock for display (Potential Sales)" },
      { key: "inventory.approve", label: "Can be selected as approver" },
      { key: "purchases.view", label: "View purchases" },
    ],
  },
  {
    group: "Sales",
    items: [
      { key: "sales.view", label: "View sales orders" },
      { key: "sales.create", label: "Create sales orders" },
      { key: "sales.edit", label: "Edit draft orders" },
      { key: "sales.cancel", label: "Cancel orders / invoices" },
      { key: "sales.priceOverride", label: "Sell below minimum / purchase price" },
      { key: "sales.viewAll", label: "See other salespeople's orders" },
      { key: "invoices.view", label: "View invoices" },
      { key: "invoices.manage", label: "Edit invoice despatch details" },
      { key: "creditNotes.manage", label: "Issue credit notes" },
    ],
  },
  {
    group: "Payments",
    items: [
      { key: "payments.view", label: "View payments" },
      { key: "payments.record", label: "Record payments / refunds" },
      { key: "payments.edit", label: "Edit or delete payments" },
    ],
  },
  {
    group: "Customers",
    items: [
      { key: "customers.view", label: "View customers" },
      { key: "customers.create", label: "Add customers" },
      { key: "customers.edit", label: "Edit customers" },
      { key: "customers.delete", label: "Delete customers" },
    ],
  },
  {
    group: "Reports",
    items: [
      { key: "reports.sales", label: "Sales reports" },
      { key: "reports.stock", label: "Stock, low-stock and movement reports" },
      { key: "reports.purchase", label: "Purchase report" },
      { key: "reports.profit", label: "Profit report" },
      { key: "reports.gst", label: "GST report" },
      { key: "reports.payment", label: "Payment report" },
      { key: "reports.valuation", label: "Inventory valuation, dead stock" },
      { key: "reports.export", label: "Export / print reports" },
    ],
  },
  {
    group: "Administration",
    items: [
      { key: "users.view", label: "View users" },
      { key: "users.manage", label: "Add / edit users" },
      { key: "users.delete", label: "Delete users" },
      { key: "roles.manage", label: "Manage roles, permissions and discount limits" },
      { key: "settings.view", label: "View settings" },
      { key: "settings.manage", label: "Change system settings" },
      { key: "audit.view", label: "View audit log and login activity" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["items"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const ADMIN_ROLE_KEY = "ADMIN";

export const DEFAULT_ROLES: {
  key: string;
  name: string;
  description: string;
  maxDiscountPercent: number;
  permissions: Permission[];
}[] = [
  {
    key: "ADMIN",
    name: "Admin",
    description: "Full system access",
    maxDiscountPercent: 100,
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "MANAGER",
    name: "Manager",
    description: "Operations and reporting",
    maxDiscountPercent: 15,
    permissions: [
      "dashboard.view", "dashboard.financials",
      "products.view", "products.create", "products.edit", "products.viewCost", "products.editCost",
      "masters.manage", "suppliers.view", "suppliers.manage",
      "inventory.view", "inventory.stockIn", "inventory.adjust", "inventory.damageLoss", "inventory.display", "inventory.approve", "purchases.view",
      "sales.view", "sales.create", "sales.edit", "sales.cancel", "sales.priceOverride", "sales.viewAll",
      "invoices.view", "invoices.manage", "creditNotes.manage",
      "payments.view", "payments.record",
      "customers.view", "customers.create", "customers.edit",
      "reports.sales", "reports.stock", "reports.purchase", "reports.profit", "reports.gst", "reports.payment", "reports.valuation", "reports.export",
      "users.view", "settings.view",
    ],
  },
  {
    key: "SALES",
    name: "Sales Staff",
    description: "Sales-oriented access",
    maxDiscountPercent: 10,
    permissions: [
      "dashboard.view",
      "products.view",
      "inventory.view",
      "sales.view", "sales.create", "sales.edit",
      "invoices.view",
      "customers.view", "customers.create", "customers.edit",
      "reports.sales",
    ],
  },
  {
    key: "ACCOUNTS",
    name: "Accounts",
    description: "Financial access",
    maxDiscountPercent: 0,
    permissions: [
      "dashboard.view", "dashboard.financials",
      "products.view", "products.viewCost",
      "inventory.view", "purchases.view", "suppliers.view",
      "sales.view", "sales.viewAll", "invoices.view", "invoices.manage", "creditNotes.manage",
      "payments.view", "payments.record", "payments.edit",
      "customers.view",
      "reports.sales", "reports.purchase", "reports.profit", "reports.gst", "reports.payment", "reports.export",
    ],
  },
];

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  roleId: number;
  roleKey: string;
  roleName: string;
  permissions: string[];
  maxDiscountPercent: number;
};

export function hasPermission(user: Pick<SessionUser, "roleKey" | "permissions"> | null | undefined, perm: Permission) {
  if (!user) return false;
  if (user.roleKey === ADMIN_ROLE_KEY) return true;
  return user.permissions.includes(perm);
}

export function hasAnyPermission(user: Pick<SessionUser, "roleKey" | "permissions"> | null | undefined, perms: Permission[]) {
  return perms.some((p) => hasPermission(user, p));
}
