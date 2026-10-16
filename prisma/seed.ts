import "dotenv/config";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_ROLES } from "../src/lib/permissions";
import { DEFAULT_SETTINGS, SETTINGS_GROUPS } from "../src/lib/settings-schema";

// Idempotent: safe to run on every deploy. Never overwrites data an admin has changed.
async function main() {
  for (const role of DEFAULT_ROLES) {
    await db.role.upsert({
      where: { key: role.key },
      create: { ...role, isSystem: true },
      update: role.key === "ADMIN" ? { permissions: role.permissions } : {},
    });
  }

  for (const group of SETTINGS_GROUPS) {
    await db.setting.upsert({
      where: { key: group },
      create: { key: group, value: DEFAULT_SETTINGS[group] as object },
      update: {},
    });
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@studiorubina.in").toLowerCase();
  const adminRole = await db.role.findUniqueOrThrow({ where: { key: "ADMIN" } });
  if ((await db.user.count()) === 0) {
    const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe@123";
    await db.user.create({
      data: {
        name: "Administrator",
        email: adminEmail,
        username: "admin",
        passwordHash: await hashPassword(password),
        roleId: adminRole.id,
      },
    });
    console.log(`Created admin user ${adminEmail} (password: ${password}) — change it after first login.`);
  }

  if (!(await db.customer.findFirst({ where: { isWalkIn: true } }))) {
    await db.customer.create({
      data: {
        code: "CASH",
        name: "Cash",
        customerType: "INDIVIDUAL",
        isWalkIn: true,
        state: DEFAULT_SETTINGS.company.state,
        stateCode: DEFAULT_SETTINGS.company.stateCode,
        notes: "Walk-in customers. Phone number optional.",
      },
    });
  }

  if ((await db.category.count()) === 0) {
    for (const name of ["Furniture", "Handicrafts", "Home Decor", "Jewellery"]) {
      await db.category.create({ data: { name } });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
