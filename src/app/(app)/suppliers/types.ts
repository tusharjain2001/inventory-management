export type SupplierRow = {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { stockIns: number };
};

export type SupplierDetail = SupplierRow & {
  stats: {
    purchases: number;
    purchaseValue: number;
    lastPurchaseDate: string | null;
    preferredForProducts: number;
  };
  recentStockIns: {
    id: number;
    stockInNo: string;
    date: string;
    purchaseInvoiceNo: string | null;
    total: number;
    _count: { items: number };
  }[];
};
