export type CustomerTypeName = "INDIVIDUAL" | "BUSINESS" | "DEALER" | "DISTRIBUTOR" | "RETAILER" | "OTHER";

export type CustomerStats = {
  totalOrders: number;
  totalPurchases: number;
  lastPurchaseDate: string | null;
  averageOrderValue: number;
  outstanding: number;
};

export type CustomerRow = {
  id: number;
  code: string;
  name: string;
  customerType: CustomerTypeName;
  companyName: string | null;
  mobile: string | null;
  altMobile: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  country: string | null;
  creditLimit: number | null;
  paymentTermsDays: number | null;
  openingBalance: number;
  notes: string | null;
  isActive: boolean;
  isWalkIn: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: CustomerStats;
};

export type CustomerDetail = CustomerRow & {
  createdBy: { name: string } | null;
  stats: CustomerStats;
};

export const CUSTOMER_TYPE_OPTIONS: { value: CustomerTypeName; label: string }[] = [
  { value: "INDIVIDUAL", label: "Individual" },
  { value: "BUSINESS", label: "Business" },
  { value: "DEALER", label: "Dealer" },
  { value: "DISTRIBUTOR", label: "Distributor" },
  { value: "RETAILER", label: "Retailer" },
  { value: "OTHER", label: "Other" },
];
