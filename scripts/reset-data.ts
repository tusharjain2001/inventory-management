import "dotenv/config";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { db } from "../src/lib/db";

// Wipes all business data (products, stock, customers, suppliers, sales, invoices, document
// numbers, audit log) and uploaded product/damage photos. Keeps users, roles, settings and the logo.
// Then re-runs the seed so the "Cash" customer and default categories exist again.
// Use before go-live (clear test data) or before loading demo data.
//
//   npx tsx scripts/reset-data.ts --yes

const TABLES = [
  "CreditNoteItem",
  "CreditNote",
  "Payment",
  "Invoice",
  "SalesOrderItem",
  "SalesOrder",
  "DisplayIssueItem",
  "DisplayIssue",
  "StockLoss",
  "StockAdjustment",
  "StockInItem",
  "StockIn",
  "InventoryTransaction",
  "ProductImage",
  "Product",
  "Supplier",
  "SubCategory",
  "Category",
  "Customer",
  "NumberSeries",
  "AuditLog",
];
const PHOTO_FOLDERS = ["products", "damages"];

async function clearPhotos() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return console.log("Supabase Storage not configured; delete ./uploads/products and ./uploads/damages by hand if needed.");
  const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from(process.env.SUPABASE_BUCKET || "uploads");
  for (const folder of PHOTO_FOLDERS) {
    for (;;) {
      const { data, error } = await bucket.list(folder, { limit: 1000 });
      if (error) throw error;
      if (!data.length) break;
      const { error: rmError } = await bucket.remove(data.map((f) => `${folder}/${f.name}`));
      if (rmError) throw rmError;
      console.log(`Removed ${data.length} file(s) from ${folder}/`);
    }
  }
}

async function main() {
  const host = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://unknown").host;
  if (!process.argv.includes("--yes")) {
    console.log(`This permanently deletes all products, stock, customers, suppliers, sales and invoices on ${host}.`);
    console.log("Users, roles and settings are kept. Run again with --yes to continue.");
    process.exit(1);
  }
  console.log(`Resetting business data on ${host}…`);
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await clearPhotos();
  await db.$disconnect();
  execSync("npx prisma db seed", { stdio: "inherit" });
  console.log("Done. Document numbers start again from 1.");
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
