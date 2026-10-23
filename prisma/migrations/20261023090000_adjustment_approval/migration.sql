-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
-- AlterTable
ALTER TABLE "StockAdjustment" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "AdjustmentStatus" NOT NULL DEFAULT 'APPROVED';
-- CreateIndex
CREATE INDEX "StockAdjustment_status_idx" ON "StockAdjustment"("status");
