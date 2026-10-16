import { z } from "zod";
import { db, transaction } from "@/lib/db";
import { badRequest, body, handler } from "@/lib/http";
import { productCreateSchema } from "@/lib/validators";
import { createProduct } from "@/lib/products";
import { getSettingsGroup } from "@/lib/settings";
import { audit } from "@/lib/audit";

const rowSchema = z.record(z.string(), z.unknown());
const schema = z.object({ rows: z.array(rowSchema).min(1).max(5000), dryRun: z.boolean().optional() });

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const numOrUndef = (v: unknown) => (str(v) === "" ? undefined : Number(str(v).replace(/[,₹\s%]/g, "")));
const yes = (v: unknown, dflt: boolean) => {
  const s = str(v).toLowerCase();
  if (!s) return dflt;
  return ["yes", "y", "true", "1"].includes(s);
};

/**
 * Bulk product import from the Excel template (rows parsed in the browser).
 * Missing categories/sub-categories are created. Each product is saved in its own
 * transaction, so one bad row does not block the others. dryRun only validates.
 */
export const POST = handler({ permission: "products.create" }, async ({ req, user, ip }) => {
  const { rows, dryRun } = await body(req, schema);
  const [inventory, tax] = await Promise.all([getSettingsGroup("inventory"), getSettingsGroup("tax")]);
  const categories = await db.category.findMany({ include: { subCategories: true } });
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const existingSkus = new Set((await db.product.findMany({ select: { sku: true } })).map((p) => p.sku.toUpperCase()));
  const seen = new Set<string>();

  const errors: { row: number; sku: string; message: string }[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2; // header is row 1 in the sheet
    const sku = str(r.sku).toUpperCase();
    if (!str(r.name) && !sku) continue; // blank line
    if (seen.has(sku)) {
      errors.push({ row: rowNo, sku, message: "Duplicate SKU in the file" });
      continue;
    }
    seen.add(sku);
    if (existingSkus.has(sku)) {
      errors.push({ row: rowNo, sku, message: "SKU already exists" });
      continue;
    }
    const categoryName = str(r.category);
    if (!categoryName) {
      errors.push({ row: rowNo, sku, message: "Category is required" });
      continue;
    }

    const draft = {
      name: str(r.name),
      sku,
      categoryId: 1, // placeholder, replaced after the category is resolved
      subCategoryId: null,
      material: str(r.material) || null,
      size: str(r.size) || null,
      weight: numOrUndef(r.weight) ?? null,
      weightUnit: str(r.weightUnit).toLowerCase() === "kg" ? "kg" : str(r.weight) ? "g" : null,
      colour: str(r.colour) || null,
      description: str(r.description) || null,
      purchasePrice: numOrUndef(r.purchasePrice) ?? 0,
      sellingPrice: numOrUndef(r.sellingPrice) ?? 0,
      minSellingPrice: numOrUndef(r.minSellingPrice) ?? null,
      discountAllowed: yes(r.discountAllowed, true),
      hsnCode: str(r.hsnCode) || null,
      taxType: "GST" as const,
      gstRate: numOrUndef(r.gstRate) ?? tax.defaultGstRate,
      cessRate: 0,
      taxInclusive: yes(r.taxInclusive, tax.pricesTaxInclusive),
      reorderLevel: numOrUndef(r.reorderLevel) ?? inventory.defaultReorderLevel,
      reorderQuantity: numOrUndef(r.reorderQuantity) ?? 0,
      preferredSupplierId: null,
      isActive: true,
      openingStock: numOrUndef(r.openingStock) ?? inventory.defaultOpeningStock,
      openingUnitCost: null,
    };
    const parsed = productCreateSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push({ row: rowNo, sku, message: `${issue.path.join(".")}: ${issue.message}` });
      continue;
    }
    if (dryRun) {
      created++;
      continue;
    }

    try {
      await transaction(async (tx) => {
        let cat = catByName.get(categoryName.toLowerCase());
        if (!cat) {
          const c = await tx.category.create({ data: { name: categoryName, createdById: user.id } });
          cat = { ...c, subCategories: [] };
        }
        let subCategoryId: number | null = null;
        const subName = str(r.subCategory);
        if (subName) {
          let sub = cat.subCategories.find((s) => s.name.toLowerCase() === subName.toLowerCase());
          if (!sub) {
            sub = await tx.subCategory.create({ data: { categoryId: cat.id, name: subName } });
            cat.subCategories.push(sub);
          }
          subCategoryId = sub.id;
        }
        await createProduct(tx, { ...parsed.data, categoryId: cat.id, subCategoryId }, user.id, ip);
        catByName.set(cat.name.toLowerCase(), cat);
      });
      existingSkus.add(sku);
      created++;
    } catch (err) {
      errors.push({ row: rowNo, sku, message: err instanceof Error ? err.message : "Could not save" });
    }
  }

  if (!dryRun && created) {
    await audit(db, { userId: user.id, action: "IMPORT", entity: "Product", summary: `Imported ${created} product(s) from Excel`, ip });
  }
  if (!created && !errors.length) throw badRequest("The file has no product rows");
  return { created, errors, dryRun: !!dryRun };
});
