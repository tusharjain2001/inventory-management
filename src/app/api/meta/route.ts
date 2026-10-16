import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { ADMIN_ROLE_KEY } from "@/lib/permissions";

/** Lookup data used by forms and filters across the app (dropdown options and a few settings). */
export const GET = handler({}, async () => {
  const [categories, suppliers, users, settings, walkIn] = await Promise.all([
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subCategories: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, gstin: true, stateCode: true } }),
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: { select: { key: true, name: true, permissions: true } } },
    }),
    getSettings(),
    db.customer.findFirst({ where: { isWalkIn: true }, select: { id: true, name: true } }),
  ]);

  return {
    categories,
    suppliers,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      roleKey: u.role.key,
      roleName: u.role.name,
      canApprove: u.role.key === ADMIN_ROLE_KEY || u.role.permissions.includes("inventory.approve"),
    })),
    walkInCustomer: walkIn,
    company: {
      name: settings.company.name,
      state: settings.company.state,
      stateCode: settings.company.stateCode,
      gstin: settings.company.gstin,
    },
    tax: settings.tax,
    inventory: settings.inventory,
    invoice: {
      defaultPaymentTermsDays: settings.invoice.defaultPaymentTermsDays,
      roundOff: settings.invoice.roundOff,
    },
    general: settings.general,
  };
});
