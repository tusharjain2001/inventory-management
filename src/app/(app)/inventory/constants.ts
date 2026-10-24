// Client-safe inventory constants and labels (also imported by the inventory API routes).
// STOCK_TXN_LABELS mirrors src/lib/inventory.ts, which imports server-only code.

export const STOCK_TXN_TYPES = [
  "OPENING",
  "STOCK_IN",
  "SALE",
  "SALE_REVERSAL",
  "DISPLAY_OUT",
  "DISPLAY_RETURN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "DAMAGED",
  "LOST",
] as const;
export type StockTxnTypeName = (typeof STOCK_TXN_TYPES)[number];

export const STOCK_TXN_LABELS: Record<StockTxnTypeName, string> = {
  OPENING: "Opening Stock",
  STOCK_IN: "Stock In",
  SALE: "Sale",
  SALE_REVERSAL: "Sale Cancelled",
  DISPLAY_OUT: "Out for Display",
  DISPLAY_RETURN: "Returned from Display",
  ADJUSTMENT_IN: "Adjustment (+)",
  ADJUSTMENT_OUT: "Adjustment (−)",
  DAMAGED: "Damaged",
  LOST: "Lost",
};

export const txnLabel = (type: string) => STOCK_TXN_LABELS[type as StockTxnTypeName] ?? type;

export const STOCK_IN_SOURCES = ["PURCHASE", "SUPPLIER_RECEIPT", "OPENING", "MANUAL"] as const;
export type StockInSourceName = (typeof STOCK_IN_SOURCES)[number];

export const ADJUSTMENT_TYPES = ["INCREASE", "DECREASE"] as const;
export const ADJUSTMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export const ADJUSTMENT_REASONS = [
  "Physical stock correction",
  "Data entry error",
  "Opening balance correction",
  "Stock reconciliation",
  "Other",
] as const;

export const LOSS_TYPES = ["DAMAGED", "LOST"] as const;
export const DISPLAY_STATUSES = ["OUT", "PARTIAL", "CLOSED"] as const;
