export type ProductRow = {
  id: number;
  name: string;
  sku: string;
  categoryId: number;
  subCategoryId: number | null;
  category: { id: number; name: string };
  subCategory: { id: number; name: string } | null;
  preferredSupplier: { id: number; name: string } | null;
  preferredSupplierId: number | null;
  /** CONSIGNMENT: the preferred supplier owns the stock and is paid once it sells. */
  sourceType: "PURCHASED" | "CONSIGNMENT";
  material: string | null;
  size: string | null;
  weight: number | null;
  weightUnit: string | null;
  colour: string | null;
  description: string | null;
  purchasePrice?: number;
  sellingPrice: number;
  minSellingPrice?: number | null;
  discountAllowed: boolean;
  hsnCode: string | null;
  taxType: "GST" | "EXEMPT" | "NIL_RATED" | "ZERO_RATED";
  gstRate: number;
  cessRate: number;
  taxInclusive: boolean;
  reorderLevel: number;
  reorderQuantity: number;
  currentStock: number;
  onDisplayStock: number;
  ownedStock: number;
  avgCost?: number;
  stockValue?: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "NEGATIVE";
  lastSaleAt: string | null;
  lastPurchaseAt: string | null;
  isActive: boolean;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductDetail = ProductRow & {
  images: { id: number; url: string; isPrimary: boolean; sortOrder: number; imageType: string }[];
  createdBy: { name: string } | null;
  sales: { last90DaysQty: number; last90DaysValue: number; totalQty: number; totalValue: number };
};
