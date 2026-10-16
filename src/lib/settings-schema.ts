import { z } from "zod";

// Settings are stored as one JSON row per group in the Setting table.
// This file is client-safe: shared by the settings pages and the server.

const numberingDoc = z.object({
  prefix: z.string().trim().max(20),
  /** Tokens: {PREFIX} {SEQ} {FY} (2026-27) {FYS} (26-27) */
  format: z.string().trim().min(1).max(60),
  padding: z.coerce.number().int().min(1).max(10),
  startNumber: z.coerce.number().int().min(1),
});
export type NumberingDoc = z.infer<typeof numberingDoc>;

export const settingsSchemas = {
  company: z.object({
    name: z.string().trim().min(1),
    logoUrl: z.string().trim().optional().default(""),
    addressLine1: z.string().trim().optional().default(""),
    addressLine2: z.string().trim().optional().default(""),
    city: z.string().trim().optional().default(""),
    state: z.string().trim().min(1),
    stateCode: z.string().trim().min(1),
    pincode: z.string().trim().optional().default(""),
    phone: z.string().trim().optional().default(""),
    email: z.string().trim().optional().default(""),
    website: z.string().trim().optional().default(""),
    gstin: z.string().trim().optional().default(""),
    pan: z.string().trim().optional().default(""),
    bankName: z.string().trim().optional().default(""),
    bankAccountNo: z.string().trim().optional().default(""),
    bankIfsc: z.string().trim().optional().default(""),
    bankBranch: z.string().trim().optional().default(""),
    declaration: z.string().trim().optional().default(""),
  }),
  tax: z.object({
    gstSlabs: z.array(z.coerce.number().min(0).max(100)).min(1),
    defaultGstRate: z.coerce.number().min(0).max(100),
    pricesTaxInclusive: z.boolean(),
    otherChargesGstRate: z.coerce.number().min(0).max(100),
  }),
  inventory: z.object({
    allowNegativeStock: z.boolean(),
    defaultReorderLevel: z.coerce.number().min(0),
    defaultOpeningStock: z.coerce.number().min(0),
    costingMethod: z.enum(["WEIGHTED_AVERAGE"]),
  }),
  invoice: z.object({
    termsAndConditions: z.string().optional().default(""),
    defaultPaymentTermsDays: z.coerce.number().int().min(0),
    roundOff: z.boolean(),
    showBankDetails: z.boolean(),
    template: z.enum(["TALLY_CLASSIC"]),
  }),
  numbering: z.object({
    invoice: numberingDoc,
    order: numberingDoc,
    creditNote: numberingDoc,
    payment: numberingDoc,
    stockIn: numberingDoc,
    adjustment: numberingDoc,
    loss: numberingDoc,
    display: numberingDoc,
    customer: numberingDoc,
  }),
  general: z.object({
    currency: z.string().trim().min(1),
    dateFormat: z.enum(["DD-MM-YYYY", "DD/MM/YYYY", "DD-MMM-YYYY", "YYYY-MM-DD"]),
    timeZone: z.string().trim().min(1),
    decimalPrecision: z.coerce.number().int().min(0).max(4),
  }),
  analysis: z.object({
    analysisPeriodDays: z.coerce.number().int().min(1),
    fastMovingThreshold: z.coerce.number().min(0),
    slowMovingThreshold: z.coerce.number().min(0),
    deadStockDays: z.coerce.number().int().min(1),
  }),
  security: z.object({
    sessionTimeoutMinutes: z.coerce.number().int().min(5).max(24 * 60),
    maxFailedAttempts: z.coerce.number().int().min(1).max(50),
    lockoutMinutes: z.coerce.number().int().min(1).max(24 * 60),
    rememberMeDays: z.coerce.number().int().min(1).max(365),
  }),
};

export type SettingsGroup = keyof typeof settingsSchemas;
export type Settings = { [K in SettingsGroup]: z.infer<(typeof settingsSchemas)[K]> };
export const SETTINGS_GROUPS = Object.keys(settingsSchemas) as SettingsGroup[];

const doc = (prefix: string, format = "{PREFIX}/{FY}/{SEQ}", padding = 5): NumberingDoc => ({
  prefix,
  format,
  padding,
  startNumber: 1,
});

export const DEFAULT_SETTINGS: Settings = {
  company: {
    name: "STUDIO RUBINA",
    logoUrl: "",
    addressLine1: "Ground Floor and Basement, C-5, EBD-65",
    addressLine2: "Emaar Business District, Sector-65",
    city: "Sohna, Gurugram",
    state: "Haryana",
    stateCode: "06",
    pincode: "122102",
    phone: "",
    email: "",
    website: "",
    gstin: "06AFZFS3754F1ZE",
    pan: "AFZFS3754F",
    bankName: "HDFC BANK",
    bankAccountNo: "99909899020071",
    bankIfsc: "HDFC0007770",
    bankBranch: "",
    declaration:
      "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
  },
  tax: {
    gstSlabs: [0, 3, 5, 18, 40],
    defaultGstRate: 18,
    pricesTaxInclusive: false,
    otherChargesGstRate: 18,
  },
  inventory: {
    allowNegativeStock: false,
    defaultReorderLevel: 2,
    defaultOpeningStock: 5,
    costingMethod: "WEIGHTED_AVERAGE",
  },
  invoice: {
    termsAndConditions: "",
    defaultPaymentTermsDays: 0,
    roundOff: true,
    showBankDetails: true,
    template: "TALLY_CLASSIC",
  },
  numbering: {
    invoice: doc("INV"),
    order: doc("SO"),
    creditNote: doc("CN"),
    payment: doc("RCPT"),
    stockIn: doc("GRN"),
    adjustment: doc("ADJ"),
    loss: doc("DL"),
    display: doc("DSP"),
    customer: doc("CUST", "{PREFIX}-{SEQ}", 4),
  },
  general: {
    currency: "INR",
    dateFormat: "DD-MM-YYYY",
    timeZone: "Asia/Kolkata",
    decimalPrecision: 2,
  },
  analysis: {
    analysisPeriodDays: 90,
    fastMovingThreshold: 0.5,
    slowMovingThreshold: 0.1,
    deadStockDays: 90,
  },
  security: {
    sessionTimeoutMinutes: 60,
    maxFailedAttempts: 5,
    lockoutMinutes: 15,
    rememberMeDays: 30,
  },
};
