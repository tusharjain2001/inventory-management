-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('GST', 'EXEMPT', 'NIL_RATED', 'ZERO_RATED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS', 'DEALER', 'DISTRIBUTOR', 'RETAILER', 'OTHER');

-- CreateEnum
CREATE TYPE "StockTxnType" AS ENUM ('OPENING', 'STOCK_IN', 'SALE', 'SALE_REVERSAL', 'DISPLAY_OUT', 'DISPLAY_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "StockInSource" AS ENUM ('PURCHASE', 'SUPPLIER_RECEIPT', 'OPENING', 'MANUAL');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "LossType" AS ENUM ('DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "DisplayStatus" AS ENUM ('OUT', 'PARTIAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'CREDIT_CARD', 'DEBIT_CARD', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('RECEIPT', 'REFUND');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "maxDiscountPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "roleId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "rememberMe" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginActivity" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "identifier" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" INTEGER,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "NumberSeries" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL,

    CONSTRAINT "NumberSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubCategory" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sku" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "subCategoryId" INTEGER,
    "material" TEXT,
    "size" TEXT,
    "weight" DECIMAL(12,3),
    "weightUnit" TEXT,
    "colour" TEXT,
    "description" TEXT,
    "purchasePrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minSellingPrice" DECIMAL(14,2),
    "discountAllowed" BOOLEAN NOT NULL DEFAULT true,
    "hsnCode" TEXT,
    "taxType" "TaxType" NOT NULL DEFAULT 'GST',
    "gstRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "cessRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "reorderLevel" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "preferredSupplierId" INTEGER,
    "currentStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "onDisplayStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "lastSaleAt" TIMESTAMP(3),
    "lastPurchaseAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "imageType" TEXT NOT NULL DEFAULT 'GALLERY',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" SERIAL NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "productId" INTEGER NOT NULL,
    "type" "StockTxnType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "stockEffect" DECIMAL(14,3) NOT NULL,
    "displayEffect" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "refType" TEXT,
    "refId" INTEGER,
    "refNo" TEXT,
    "remarks" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIn" (
    "id" SERIAL NOT NULL,
    "stockInNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" "StockInSource" NOT NULL,
    "supplierId" INTEGER,
    "purchaseInvoiceNo" TEXT,
    "purchaseInvoiceDate" TIMESTAMP(3),
    "remarks" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockInItem" (
    "id" SERIAL NOT NULL,
    "stockInId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "batchNo" TEXT,

    CONSTRAINT "StockInItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" SERIAL NOT NULL,
    "adjustmentNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "productId" INTEGER NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "existingStock" DECIMAL(14,3) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "newStock" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "approvedById" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLoss" (
    "id" SERIAL NOT NULL,
    "lossNo" TEXT NOT NULL,
    "type" "LossType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "location" TEXT,
    "remarks" TEXT,
    "attachmentUrl" TEXT,
    "attachmentPath" TEXT,
    "approvedById" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLoss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayIssue" (
    "id" SERIAL NOT NULL,
    "displayNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customerId" INTEGER,
    "locationName" TEXT NOT NULL,
    "address" TEXT,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "expectedReturnDate" TIMESTAMP(3),
    "status" "DisplayStatus" NOT NULL DEFAULT 'OUT',
    "remarks" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayIssueItem" (
    "id" SERIAL NOT NULL,
    "displayIssueId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "returnedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "soldQty" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "DisplayIssueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "companyName" TEXT,
    "mobile" TEXT,
    "altMobile" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "country" TEXT DEFAULT 'India',
    "creditLimit" DECIMAL(14,2),
    "paymentTermsDays" INTEGER,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" SERIAL NOT NULL,
    "orderNo" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerGstin" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "placeOfSupply" TEXT NOT NULL,
    "placeOfSupplyCode" TEXT NOT NULL,
    "isInterState" BOOLEAN NOT NULL DEFAULT false,
    "salespersonId" INTEGER,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "itemDiscountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoiceDiscountType" "DiscountType",
    "invoiceDiscountValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoiceDiscountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherChargesLabel" TEXT,
    "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherChargesGstRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxableTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cessTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "displayIssueId" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "cancelReason" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hsnCode" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "listPrice" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "discountPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoiceDiscountShare" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxType" "TaxType" NOT NULL DEFAULT 'GST',
    "gstRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "cessRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "priceOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideById" INTEGER,
    "displayIssueItemId" INTEGER,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "orderId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditNoteTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(14,2) NOT NULL,
    "companySnapshot" JSONB NOT NULL,
    "eWayBillNo" TEXT,
    "deliveryNote" TEXT,
    "supplierRef" TEXT,
    "buyersOrderNo" TEXT,
    "buyersOrderDate" TIMESTAMP(3),
    "despatchDocNo" TEXT,
    "despatchedThrough" TEXT,
    "destination" TEXT,
    "termsOfDelivery" TEXT,
    "otherReferences" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "cancelReason" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL DEFAULT 'RECEIPT',
    "invoiceId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "receivedById" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" SERIAL NOT NULL,
    "creditNoteNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "isInterState" BOOLEAN NOT NULL DEFAULT false,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "taxableTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cessTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteItem" (
    "id" SERIAL NOT NULL,
    "creditNoteId" INTEGER NOT NULL,
    "orderItemId" INTEGER,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "taxableValue" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "cessRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginActivity_createdAt_idx" ON "LoginActivity"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "NumberSeries_key_financialYear_key" ON "NumberSeries"("key", "financialYear");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubCategory_categoryId_name_key" ON "SubCategory"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_productId_txnDate_idx" ON "InventoryTransaction"("productId", "txnDate");

-- CreateIndex
CREATE INDEX "InventoryTransaction_type_txnDate_idx" ON "InventoryTransaction"("type", "txnDate");

-- CreateIndex
CREATE INDEX "InventoryTransaction_refType_refId_idx" ON "InventoryTransaction"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "StockIn_stockInNo_key" ON "StockIn"("stockInNo");

-- CreateIndex
CREATE INDEX "StockIn_date_idx" ON "StockIn"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_adjustmentNo_key" ON "StockAdjustment"("adjustmentNo");

-- CreateIndex
CREATE INDEX "StockAdjustment_date_idx" ON "StockAdjustment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StockLoss_lossNo_key" ON "StockLoss"("lossNo");

-- CreateIndex
CREATE INDEX "StockLoss_date_idx" ON "StockLoss"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayIssue_displayNo_key" ON "DisplayIssue"("displayNo");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_mobile_idx" ON "Customer"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNo_key" ON "SalesOrder"("orderNo");

-- CreateIndex
CREATE INDEX "SalesOrder_orderDate_idx" ON "SalesOrder"("orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_paymentStatus_idx" ON "Invoice"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentNo_key" ON "Payment"("paymentNo");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_creditNoteNo_key" ON "CreditNote"("creditNoteNo");

-- CreateIndex
CREATE INDEX "CreditNote_date_idx" ON "CreditNote"("date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginActivity" ADD CONSTRAINT "LoginActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCategory" ADD CONSTRAINT "SubCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_stockInId_fkey" FOREIGN KEY ("stockInId") REFERENCES "StockIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLoss" ADD CONSTRAINT "StockLoss_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLoss" ADD CONSTRAINT "StockLoss_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLoss" ADD CONSTRAINT "StockLoss_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayIssue" ADD CONSTRAINT "DisplayIssue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayIssue" ADD CONSTRAINT "DisplayIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayIssueItem" ADD CONSTRAINT "DisplayIssueItem_displayIssueId_fkey" FOREIGN KEY ("displayIssueId") REFERENCES "DisplayIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayIssueItem" ADD CONSTRAINT "DisplayIssueItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_displayIssueId_fkey" FOREIGN KEY ("displayIssueId") REFERENCES "DisplayIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_overrideById_fkey" FOREIGN KEY ("overrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_displayIssueItemId_fkey" FOREIGN KEY ("displayIssueItemId") REFERENCES "DisplayIssueItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
