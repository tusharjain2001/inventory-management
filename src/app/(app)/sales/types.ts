import type { EffectivePaymentStatus, HsnRow, PaymentStatusName, TaxTypeName } from "@/lib/calc";

export type OrderStatus = "DRAFT" | "CONFIRMED" | "INVOICED" | "CANCELLED";
export type PaymentModeName =
  | "CASH"
  | "UPI"
  | "BANK_TRANSFER"
  | "NEFT"
  | "RTGS"
  | "IMPS"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CHEQUE"
  | "OTHER";

export const PAYMENT_MODE_OPTIONS: { value: PaymentModeName; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "DEBIT_CARD", label: "Debit Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "NEFT", label: "NEFT" },
  { value: "RTGS", label: "RTGS" },
  { value: "IMPS", label: "IMPS" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

export type UserRef = { id: number; name: string } | null;

/** Product fields the order form needs (from /api/products). */
export type ProductLite = {
  id: number;
  name: string;
  sku: string;
  sellingPrice: number;
  gstRate: number;
  cessRate: number;
  taxType: TaxTypeName;
  taxInclusive: boolean;
  hsnCode: string | null;
  currentStock: number;
  discountAllowed: boolean;
};

export type CustomerLite = {
  id: number;
  code?: string;
  name: string;
  mobile: string | null;
  gstin: string | null;
  stateCode: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  paymentTermsDays?: number | null;
  creditLimit?: number | null;
  isWalkIn?: boolean;
};

export type OrderRow = {
  id: number;
  orderNo: string;
  orderDate: string;
  status: OrderStatus;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
  salesperson: UserRef;
  invoice: { id: number; invoiceNo: string; paymentStatus: PaymentStatusName; status: "ACTIVE" | "CANCELLED"; balanceDue: number } | null;
  _count: { items: number };
};

export type OrderItem = {
  id: number;
  productId: number;
  sortOrder: number;
  sku: string;
  name: string;
  description: string | null;
  hsnCode: string | null;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  taxInclusive: boolean;
  discountPercent: number;
  discountAmount: number;
  grossAmount: number;
  invoiceDiscountShare: number;
  taxableValue: number;
  taxType: TaxTypeName;
  gstRate: number;
  cessRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  lineTotal: number;
  unitCost?: number;
  priceOverride: boolean;
  displayIssueItemId: number | null;
  creditedTaxable?: number;
  product?: ProductLite;
  overrideBy?: { name: string } | null;
};

export type OrderTotalsFields = {
  subtotal: number;
  itemDiscountTotal: number;
  invoiceDiscountType: "PERCENT" | "AMOUNT" | null;
  invoiceDiscountValue: number;
  invoiceDiscountAmount: number;
  otherChargesLabel: string | null;
  otherCharges: number;
  otherChargesGstRate: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  cessTotal: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  isInterState: boolean;
};

export type OrderDetail = OrderTotalsFields & {
  id: number;
  orderNo: string;
  orderDate: string;
  status: OrderStatus;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  customerGstin: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  placeOfSupply: string;
  placeOfSupplyCode: string;
  salespersonId: number | null;
  paymentTermsDays: number;
  notes: string | null;
  displayIssueId: number | null;
  displayIssue: { id: number; displayNo: string } | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  items: OrderItem[];
  customer: CustomerLite;
  salesperson: UserRef;
  createdBy: UserRef;
  confirmedBy: { name: string } | null;
  cancelledBy: { name: string } | null;
  invoice: {
    id: number;
    invoiceNo: string;
    invoiceDate: string;
    paymentStatus: PaymentStatusName;
    status: "ACTIVE" | "CANCELLED";
    balanceDue: number;
    dueDate: string;
  } | null;
};

export type InvoiceRow = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  status: "ACTIVE" | "CANCELLED";
  paymentStatus: PaymentStatusName;
  displayStatus: EffectivePaymentStatus;
  grandTotal: number;
  amountPaid: number;
  creditNoteTotal: number;
  balanceDue: number;
  customerId: number;
  order: {
    id: number;
    orderNo: string;
    customerName: string;
    customerPhone: string | null;
    taxableTotal: number;
    taxTotal: number;
    salesperson: UserRef;
  };
};

export type PaymentRow = {
  id: number;
  paymentNo: string;
  type: "RECEIPT" | "REFUND";
  invoiceId: number;
  customerId: number;
  paymentDate: string;
  amount: number;
  mode: PaymentModeName;
  reference: string | null;
  notes: string | null;
  receivedById: number | null;
  receivedBy: UserRef;
  invoice?: { id: number; invoiceNo: string; status: string; order: { customerName: string } };
  createdBy?: { name: string } | null;
};

export type CreditNoteItem = {
  id: number;
  orderItemId: number | null;
  description: string;
  hsnCode: string | null;
  taxableValue: number;
  gstRate: number;
  cessRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  total: number;
};

export type CreditNoteRow = {
  id: number;
  creditNoteNo: string;
  date: string;
  invoiceId: number;
  reason: string;
  status: "ACTIVE" | "CANCELLED";
  isInterState: boolean;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  cessTotal: number;
  total: number;
  invoice?: { id: number; invoiceNo: string; order: { customerName: string } };
  createdBy?: { name: string } | null;
  items?: CreditNoteItem[];
};

export type CompanySnapshot = {
  name: string;
  logoUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state: string;
  stateCode: string;
  pincode?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  pan?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  declaration?: string;
  termsAndConditions?: string;
  showBankDetails?: boolean;
};

export type TaxLine = { label: string; head: "CGST" | "SGST" | "IGST" | "CESS"; rate: number; amount: number };

export type DespatchFields = {
  eWayBillNo: string | null;
  deliveryNote: string | null;
  supplierRef: string | null;
  otherReferences: string | null;
  buyersOrderNo: string | null;
  buyersOrderDate: string | null;
  despatchDocNo: string | null;
  despatchedThrough: string | null;
  destination: string | null;
  termsOfDelivery: string | null;
};

export type InvoiceDetail = DespatchFields & {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  orderId: number;
  customerId: number;
  status: "ACTIVE" | "CANCELLED";
  paymentStatus: PaymentStatusName;
  displayStatus: EffectivePaymentStatus;
  grandTotal: number;
  amountPaid: number;
  creditNoteTotal: number;
  balanceDue: number;
  companySnapshot: CompanySnapshot;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: { name: string } | null;
  createdBy: { name: string } | null;
  createdAt: string;
  order: Omit<OrderDetail, "invoice" | "customer" | "confirmedBy" | "cancelledBy">;
  customer: CustomerLite & { pan: string | null; email: string | null };
  payments: PaymentRow[];
  creditNotes: (CreditNoteRow & { items: CreditNoteItem[] })[];
  hsnRows: HsnRow[];
  taxLines: TaxLine[];
  otherChargesTax: { cgst: number; sgst: number; igst: number; cess: number };
  totalInWords: string;
  taxInWords: string;
};

export type CreditNoteDetail = CreditNoteRow & {
  customerId: number;
  createdAt: string;
  items: (CreditNoteItem & { orderItem: { quantity: number; sku: string } | null })[];
  customer: CustomerLite & { pan: string | null };
  invoice: {
    id: number;
    invoiceNo: string;
    invoiceDate: string;
    status: "ACTIVE" | "CANCELLED";
    companySnapshot: CompanySnapshot;
    grandTotal: number;
    order: {
      id: number;
      orderNo: string;
      customerName: string;
      customerPhone: string | null;
      customerGstin: string | null;
      billingAddress: string | null;
      placeOfSupply: string;
      placeOfSupplyCode: string;
    };
  };
  hsnRows: HsnRow[];
  taxLines: TaxLine[];
  taxTotal: number;
  totalInWords: string;
  taxInWords: string;
};
