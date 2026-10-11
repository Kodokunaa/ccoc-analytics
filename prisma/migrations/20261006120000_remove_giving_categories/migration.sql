-- Remove categorization without deleting or changing any giving amounts.
BEGIN;
ALTER TABLE "GivingRecord" DROP CONSTRAINT "GivingRecord_categoryId_fkey";
DROP INDEX "GivingRecord_serviceId_categoryId_idx";
ALTER TABLE "GivingRecord" DROP COLUMN "categoryId";
DROP TABLE "GivingCategory";
CREATE INDEX "GivingRecord_serviceId_idx" ON "GivingRecord"("serviceId");
COMMIT;
