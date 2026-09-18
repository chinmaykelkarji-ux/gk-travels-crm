-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('PER_PERSON', 'PER_UNIT', 'PER_ROOM', 'PER_GROUP');

-- AlterEnum
ALTER TYPE "GstMode" ADD VALUE 'NONE';

-- AlterTable
ALTER TABLE "sales_quote_items" ADD COLUMN     "customerNote" TEXT,
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "isSelectedOption" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nights" INTEGER,
ADD COLUMN     "optionGroupId" TEXT,
ADD COLUMN     "partyId" TEXT,
ADD COLUMN     "pricingBasis" "PricingBasis" NOT NULL DEFAULT 'PER_UNIT',
ADD COLUMN     "serviceDate" TIMESTAMP(3),
ADD COLUMN     "taxRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "sales_quotes" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "adults" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "approvalComment" TEXT,
ADD COLUMN     "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "children" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "costAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "exclusions" TEXT,
ADD COLUMN     "gstMode" "GstMode" NOT NULL DEFAULT 'EXCLUDED',
ADD COLUMN     "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 5,
ADD COLUMN     "inclusions" TEXT,
ADD COLUMN     "infants" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentQuoteId" TEXT,
ADD COLUMN     "paymentPolicy" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "totalsCache" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "sales_quote_option_groups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "salesQuoteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sales_quote_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quote_parties" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "salesQuoteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "travellerIds" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sales_quote_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quote_item_rates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "itemId" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_quote_item_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_quote_option_groups_organizationId_idx" ON "sales_quote_option_groups"("organizationId");

-- CreateIndex
CREATE INDEX "sales_quote_option_groups_salesQuoteId_idx" ON "sales_quote_option_groups"("salesQuoteId");

-- CreateIndex
CREATE INDEX "sales_quote_parties_organizationId_idx" ON "sales_quote_parties"("organizationId");

-- CreateIndex
CREATE INDEX "sales_quote_parties_salesQuoteId_idx" ON "sales_quote_parties"("salesQuoteId");

-- CreateIndex
CREATE INDEX "sales_quote_item_rates_organizationId_idx" ON "sales_quote_item_rates"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quote_item_rates_itemId_band_key" ON "sales_quote_item_rates"("itemId", "band");

-- CreateIndex
CREATE INDEX "sales_quote_items_optionGroupId_idx" ON "sales_quote_items"("optionGroupId");

-- CreateIndex
CREATE INDEX "sales_quote_items_partyId_idx" ON "sales_quote_items"("partyId");

-- CreateIndex
CREATE INDEX "sales_quotes_parentQuoteId_idx" ON "sales_quotes"("parentQuoteId");

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_parentQuoteId_fkey" FOREIGN KEY ("parentQuoteId") REFERENCES "sales_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_option_groups" ADD CONSTRAINT "sales_quote_option_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_option_groups" ADD CONSTRAINT "sales_quote_option_groups_salesQuoteId_fkey" FOREIGN KEY ("salesQuoteId") REFERENCES "sales_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_parties" ADD CONSTRAINT "sales_quote_parties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_parties" ADD CONSTRAINT "sales_quote_parties_salesQuoteId_fkey" FOREIGN KEY ("salesQuoteId") REFERENCES "sales_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_item_rates" ADD CONSTRAINT "sales_quote_item_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_item_rates" ADD CONSTRAINT "sales_quote_item_rates_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "sales_quote_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_items" ADD CONSTRAINT "sales_quote_items_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "sales_quote_option_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_items" ADD CONSTRAINT "sales_quote_items_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "sales_quote_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: existing quotes snapshot pax from their enquiry; legacy items priced per unit.
UPDATE "sales_quotes" sq SET "adults" = GREATEST(e."adults", 1), "children" = e."children", "infants" = e."infants"
FROM "enquiries" e WHERE e."id" = sq."enquiryId";
UPDATE "sales_quotes" SET "taxableAmount" = "subtotal" - "discountAmount", "costAmount" = COALESCE((
  SELECT SUM(i."costPrice" * i."quantity") FROM "sales_quote_items" i WHERE i."salesQuoteId" = "sales_quotes"."id"), 0);

-- Seed the quote-number sequence from GK-Q-YYYY-NNNN numbers already issued.
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT c."organizationId" || '-Q-' || yr, c."organizationId", 'Q', yr, maxn, NOW()
FROM (SELECT "organizationId", split_part("quoteNumber", '-', 3) AS yr, MAX(split_part(split_part("quoteNumber", '-', 4), '-', 1)::int) AS maxn
      FROM "sales_quotes" WHERE "quoteNumber" ~ '^GK-Q-[0-9]{4}-[0-9]+' GROUP BY 1, 2) c
ON CONFLICT ("organizationId", "docType", "financialYear") DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");
