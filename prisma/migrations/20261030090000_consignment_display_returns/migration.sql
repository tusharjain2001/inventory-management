-- CreateEnum
CREATE TYPE "ProductSource" AS ENUM ('PURCHASED', 'CONSIGNMENT');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sourceType" "ProductSource" NOT NULL DEFAULT 'PURCHASED';

-- AlterTable
ALTER TABLE "SalesOrderItem" ADD COLUMN     "consignmentSettlementId" INTEGER,
ADD COLUMN     "consignmentSupplierId" INTEGER;

-- CreateTable
CREATE TABLE "DisplayReturn" (
    "id" SERIAL NOT NULL,
    "returnNo" TEXT NOT NULL,
    "displayIssueId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisplayReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayReturnItem" (
    "id" SERIAL NOT NULL,
    "displayReturnId" INTEGER NOT NULL,
    "displayIssueItemId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "DisplayReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentSettlement" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "remarks" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignmentSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisplayReturn_returnNo_key" ON "DisplayReturn"("returnNo");

-- CreateIndex
CREATE INDEX "DisplayReturn_displayIssueId_idx" ON "DisplayReturn"("displayIssueId");

-- CreateIndex
CREATE INDEX "ConsignmentSettlement_supplierId_idx" ON "ConsignmentSettlement"("supplierId");

-- CreateIndex
CREATE INDEX "SalesOrderItem_consignmentSupplierId_idx" ON "SalesOrderItem"("consignmentSupplierId");

-- AddForeignKey
ALTER TABLE "DisplayReturn" ADD CONSTRAINT "DisplayReturn_displayIssueId_fkey" FOREIGN KEY ("displayIssueId") REFERENCES "DisplayIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayReturn" ADD CONSTRAINT "DisplayReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayReturnItem" ADD CONSTRAINT "DisplayReturnItem_displayReturnId_fkey" FOREIGN KEY ("displayReturnId") REFERENCES "DisplayReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayReturnItem" ADD CONSTRAINT "DisplayReturnItem_displayIssueItemId_fkey" FOREIGN KEY ("displayIssueItemId") REFERENCES "DisplayIssueItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_consignmentSupplierId_fkey" FOREIGN KEY ("consignmentSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_consignmentSettlementId_fkey" FOREIGN KEY ("consignmentSettlementId") REFERENCES "ConsignmentSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Grant the new consignment payment permission to the default Manager and Accounts roles.
UPDATE "Role" SET "permissions" = array_append("permissions", 'consignment.settle')
WHERE "key" IN ('MANAGER', 'ACCOUNTS') AND NOT ('consignment.settle' = ANY("permissions"));
