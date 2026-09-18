-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "RelationshipKind" AS ENUM ('FAMILY', 'GROUP', 'COMPANY', 'FRIEND');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "phoneNormalized" TEXT,
ADD COLUMN     "referredByCustomerId" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL';

-- CreateTable
CREATE TABLE "customer_relationships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "customerId" TEXT NOT NULL,
    "relatedCustomerId" TEXT NOT NULL,
    "kind" "RelationshipKind" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_relationships_organizationId_idx" ON "customer_relationships"("organizationId");

-- CreateIndex
CREATE INDEX "customer_relationships_relatedCustomerId_idx" ON "customer_relationships"("relatedCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_relationships_customerId_relatedCustomerId_key" ON "customer_relationships"("customerId", "relatedCustomerId");

-- CreateIndex
CREATE INDEX "customers_organizationId_phoneNormalized_idx" ON "customers"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "customers_organizationId_deletedAt_idx" ON "customers"("organizationId", "deletedAt");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_referredByCustomerId_fkey" FOREIGN KEY ("referredByCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_relationships" ADD CONSTRAINT "customer_relationships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_relationships" ADD CONSTRAINT "customer_relationships_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_relationships" ADD CONSTRAINT "customer_relationships_relatedCustomerId_fkey" FOREIGN KEY ("relatedCustomerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: normalised phone for duplicate detection (mirrors src/shared/calc/phone.ts).
UPDATE "customers" SET "phoneNormalized" = sub.n FROM (
  SELECT "id",
    CASE
      WHEN d = '' THEN NULL
      WHEN d LIKE '0091%' AND length(d) > 6 THEN substr(d, 5)
      WHEN length(d) = 12 AND d LIKE '91%' THEN substr(d, 3)
      WHEN length(d) = 11 AND d LIKE '0%' THEN substr(d, 2)
      WHEN length(d) >= 6 THEN d
      ELSE NULL
    END AS n
  FROM (SELECT "id", regexp_replace(coalesce("phone", ''), '\D', '', 'g') AS d FROM "customers") x
) sub WHERE "customers"."id" = sub."id";

-- Backfill: corporate flag from company name / GST registration.
UPDATE "customers" SET "type" = 'CORPORATE' WHERE "gstRegistered" = true OR (coalesce("companyName", '') <> '' AND "gstNumber" IS NOT NULL);

-- Seed the CUS display-id sequence so new customers continue after existing CUS-YYYY-NNNN ids.
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT c."organizationId" || '-CUS-' || yr, c."organizationId", 'CUS', yr, maxn, NOW()
FROM (
  SELECT "organizationId", split_part("id", '-', 2) AS yr, MAX(split_part("id", '-', 3)::int) AS maxn
  FROM "customers"
  WHERE "id" ~ '^CUS-[0-9]{4}-[0-9]+$'
  GROUP BY 1, 2
) c
ON CONFLICT ("organizationId", "docType", "financialYear")
DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");
