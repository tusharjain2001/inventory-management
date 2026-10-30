import type { StockInSourceName, StockTxnTypeName } from "./constants";

type Ref = { id: number; name: string };
type ProductRef = { id: number; name: string; sku: string };

export type InventorySummary = {
  unitsInShowroom: number;
  unitsOnDisplay: number;
  activeSkus: number;
  stockValue: number | null;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  negativeStock: number;
  openDisplays: number;
  pendingAdjustments: number;
};

export type StockInRow = {
  id: number;
  stockInNo: string;
  date: string;
  source: StockInSourceName;
  supplier: Ref | null;
  purchaseInvoiceNo: string | null;
  purchaseInvoiceDate: string | null;
  remarks: string | null;
  createdBy: Ref | null;
  itemCount: number;
  totalQty: number;
  // Present only for users who can see purchase cost.
  subtotal?: number;
  discountTotal?: number;
  taxableTotal?: number;
  gstTotal?: number;
  total?: number;
};

export type StockInDetail = Omit<StockInRow, "itemCount" | "totalQty" | "supplier"> & {
  createdAt: string;
  supplier: (Ref & { gstin: string | null; phone: string | null }) | null;
  items: {
    id: number;
    productId: number;
    product: ProductRef & { hsnCode: string | null };
    quantity: number;
    gstRate: number;
    batchNo: string | null;
    unitCost?: number;
    discountAmount?: number;
    taxableValue?: number;
    gstAmount?: number;
    totalCost?: number;
  }[];
};

export type AdjustmentRow = {
  id: number;
  adjustmentNo: string;
  date: string;
  product: ProductRef;
  type: "INCREASE" | "DECREASE";
  existingStock: number;
  quantity: number;
  newStock: number;
  reason: string;
  remarks: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  /** Approver, or the person who rejected it. */
  approvedBy: Ref | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdBy: Ref | null;
  createdAt: string;
};

export type LossRow = {
  id: number;
  lossNo: string;
  type: "DAMAGED" | "LOST";
  date: string;
  product: ProductRef;
  quantity: number;
  unitCost?: number;
  value?: number;
  reason: string;
  location: string | null;
  remarks: string | null;
  attachmentUrl: string | null;
  approvedBy: Ref | null;
  createdBy: Ref | null;
  createdAt: string;
};

export type DisplayStatusName = "OUT" | "PARTIAL" | "CLOSED";

export type DisplayRow = {
  id: number;
  displayNo: string;
  date: string;
  customer: Ref | null;
  locationName: string;
  contactPerson: string | null;
  contactPhone: string | null;
  expectedReturnDate: string | null;
  status: DisplayStatusName;
  createdBy: Ref | null;
  itemCount: number;
  totalQty: number;
  returnedQty: number;
  soldQty: number;
  outstandingQty: number;
};

export type DisplayDetail = {
  id: number;
  displayNo: string;
  date: string;
  customer: (Ref & { mobile: string | null }) | null;
  locationName: string;
  address: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  expectedReturnDate: string | null;
  status: DisplayStatusName;
  remarks: string | null;
  createdBy: Ref | null;
  createdAt: string;
  items: {
    id: number;
    productId: number;
    product: ProductRef & {
      sellingPrice: number;
      gstRate: number;
      hsnCode: string | null;
      taxType: string;
      cessRate: number;
      taxInclusive: boolean;
    };
    quantity: number;
    returnedQty: number;
    soldQty: number;
    outstandingQty: number;
  }[];
  orders: { id: number; orderNo: string; status: string; orderDate: string; grandTotal: number }[];
  /** Inward challans, one per return. */
  returns: { id: number; returnNo: string; date: string; remarks: string | null; createdBy: Ref | null; quantity: number }[];
  movements: { id: number; txnDate: string; type: StockTxnTypeName; quantity: number; remarks: string | null; product: ProductRef; createdBy: Ref | null }[];
};

export type LedgerRow = {
  id: number;
  txnDate: string;
  type: StockTxnTypeName;
  product: ProductRef;
  quantity: number;
  stockEffect: number;
  displayEffect: number;
  balanceAfter: number;
  unitCost?: number;
  totalCost?: number;
  refType: string | null;
  refId: number | null;
  refNo: string | null;
  remarks: string | null;
  createdBy: Ref | null;
};
