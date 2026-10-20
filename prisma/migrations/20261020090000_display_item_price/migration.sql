-- AlterTable
ALTER TABLE "DisplayIssueItem" ADD COLUMN "unitPrice" DECIMAL(14,2);

-- Backfill existing display items with the product's current selling price
UPDATE "DisplayIssueItem" d SET "unitPrice" = p."sellingPrice" FROM "Product" p WHERE p."id" = d."productId";
