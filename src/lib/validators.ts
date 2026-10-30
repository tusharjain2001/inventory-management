import { z } from "zod";
import { GSTIN_REGEX, PAN_REGEX } from "@/lib/india";

// Shared (client + server) validation for master data.

const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Must be a number" });
      return z.NEVER;
    }
    return n;
  });

const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Cannot be negative");
const qty = z.coerce.number({ message: "Enter a quantity" }).min(0, "Cannot be negative");

export const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || GSTIN_REGEX.test(v), "Invalid GSTIN (15 characters, e.g. 06AFZFS3754F1ZE)");

export const panField = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || PAN_REGEX.test(v), "Invalid PAN (e.g. AFZFS3754F)");

export const mobileField = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v.replace(/[\s-]/g, "") : null))
  .refine((v) => !v || /^(\+?91)?[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number");

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email");

// ───────────── Category ─────────────

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: optText(),
  isActive: z.boolean().optional().default(true),
});

export const subCategorySchema = categorySchema.extend({
  categoryId: z.coerce.number().int().positive("Choose a category"),
});

// ───────────── Supplier ─────────────

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  contactPerson: optText(100),
  phone: optText(30),
  email: emailField,
  gstin: gstinField,
  pan: panField,
  address: optText(),
  city: optText(100),
  state: optText(100),
  stateCode: optText(4),
  pincode: optText(10),
  notes: optText(1000),
  isActive: z.boolean().optional().default(true),
});

// ───────────── Customer ─────────────

export const CUSTOMER_TYPES = ["INDIVIDUAL", "BUSINESS", "DEALER", "DISTRIBUTOR", "RETAILER", "OTHER"] as const;

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  customerType: z.enum(CUSTOMER_TYPES).default("INDIVIDUAL"),
  companyName: optText(200),
  mobile: mobileField,
  altMobile: mobileField,
  email: emailField,
  gstin: gstinField,
  pan: panField,
  billingAddress: optText(),
  shippingAddress: optText(),
  city: optText(100),
  state: optText(100),
  stateCode: optText(4),
  pincode: optText(10),
  country: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((v) => v || "India"),
  creditLimit: optNumber.refine((v) => v === null || v >= 0, "Cannot be negative"),
  paymentTermsDays: optNumber.refine((v) => v === null || (Number.isInteger(v) && v >= 0), "Enter whole days"),
  openingBalance: z.coerce.number().optional().default(0),
  notes: optText(1000),
  isActive: z.boolean().optional().default(true),
});

// ───────────── Product ─────────────

export const TAX_TYPES = ["GST", "EXEMPT", "NIL_RATED", "ZERO_RATED"] as const;
export const PRODUCT_SOURCES = ["PURCHASED", "CONSIGNMENT"] as const;

export const productSchema = z
  .object({
    name: z.string().trim().min(1, "Product name is required").max(200, "Max 200 characters"),
    sku: z.string().trim().min(1, "SKU is required").max(60).toUpperCase(),
    categoryId: z.coerce.number().int().positive("Choose a category"),
    subCategoryId: optNumber,
    material: optText(100),
    size: optText(100),
    weight: optNumber.refine((v) => v === null || v > 0, "Weight must be positive"),
    weightUnit: z.enum(["g", "kg"]).optional().nullable(),
    colour: optText(60),
    description: optText(10000),
    purchasePrice: money,
    sellingPrice: money,
    minSellingPrice: optNumber,
    discountAllowed: z.boolean().optional().default(true),
    hsnCode: optText(10),
    taxType: z.enum(TAX_TYPES).default("GST"),
    gstRate: z.coerce.number().min(0).max(100),
    cessRate: z.coerce.number().min(0).max(100).optional().default(0),
    taxInclusive: z.boolean().optional().default(false),
    reorderLevel: qty.optional().default(0),
    reorderQuantity: qty.optional().default(0),
    preferredSupplierId: optNumber,
    sourceType: z.enum(PRODUCT_SOURCES).optional().default("PURCHASED"),
    isActive: z.boolean().optional().default(true),
  })
  .refine((p) => p.sourceType !== "CONSIGNMENT" || p.preferredSupplierId !== null, {
    message: "Choose the supplier who sent this product on consignment",
    path: ["preferredSupplierId"],
  })
  .refine((p) => p.minSellingPrice === null || p.minSellingPrice <= p.sellingPrice, {
    message: "Minimum selling price cannot be above the selling price",
    path: ["minSellingPrice"],
  });

export const productCreateSchema = productSchema.and(
  z.object({
    openingStock: qty.optional().default(0),
    openingUnitCost: optNumber,
  }),
);

export type ProductInput = z.input<typeof productSchema>;
