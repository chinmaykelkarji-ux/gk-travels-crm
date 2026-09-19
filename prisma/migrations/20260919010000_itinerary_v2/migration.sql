-- Phase 3.5: itinerary v2. Additive only: classic itineraries keep
-- format = 'CLASSIC' and every existing column. Timed day items with
-- customer text, internal notes and internal cost; revision + shared
-- revision so the office knows whether the customer has the latest copy.
-- Reverse: DROP TABLE "itinerary_items"; ALTER TABLE "itinerary_days" DROP COLUMN "internalNotes";
--          ALTER TABLE "itineraries" DROP COLUMN "format", DROP COLUMN "internalNotes", DROP COLUMN "revision",
--          DROP COLUMN "sharedAt", DROP COLUMN "sharedById", DROP COLUMN "sharedRevision", DROP COLUMN "updatedById";

-- AlterTable
ALTER TABLE "itineraries" ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'CLASSIC',
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sharedAt" TIMESTAMP(3),
ADD COLUMN     "sharedById" TEXT,
ADD COLUMN     "sharedRevision" INTEGER,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "itinerary_days" ADD COLUMN     "internalNotes" TEXT;

-- CreateTable
CREATE TABLE "itinerary_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "itineraryId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "time" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "title" TEXT NOT NULL,
    "details" TEXT,
    "internalNote" TEXT,
    "internalCost" DECIMAL(12,2),
    "customerVisible" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itinerary_items_organizationId_idx" ON "itinerary_items"("organizationId");

-- CreateIndex
CREATE INDEX "itinerary_items_itineraryId_idx" ON "itinerary_items"("itineraryId");

-- CreateIndex
CREATE INDEX "itinerary_items_dayId_idx" ON "itinerary_items"("dayId");

-- CreateIndex
CREATE INDEX "itinerary_items_sourceType_sourceId_idx" ON "itinerary_items"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "itinerary_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the ITN display-id sequence from ids the classic builder already used.
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT "organizationId" || '-ITN-' || yr, "organizationId", 'ITN', yr, maxn, NOW()
FROM (
  SELECT "organizationId", split_part("id", '-', 2) AS yr, MAX(NULLIF(split_part("id", '-', 3), '')::int) AS maxn
  FROM "itineraries"
  WHERE "id" ~ '^ITN-[0-9]{4}-[0-9]+$'
  GROUP BY 1, 2
) s
ON CONFLICT ("organizationId", "docType", "financialYear")
DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");
