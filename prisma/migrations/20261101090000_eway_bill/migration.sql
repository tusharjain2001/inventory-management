-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "eWayBillDate" TIMESTAMP(3),
ADD COLUMN     "eWayBillFilePath" TEXT,
ADD COLUMN     "eWayBillFileUrl" TEXT,
ADD COLUMN     "vehicleNo" TEXT;

