-- CreateEnum
CREATE TYPE "TravellerRole" AS ENUM ('LEAD', 'ADULT', 'CHILD', 'INFANT');

-- AlterTable
ALTER TABLE "passengers" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "govtIdNumber" TEXT,
ADD COLUMN     "govtIdType" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "relationToCustomer" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "trip_travellers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "tripId" TEXT NOT NULL,
    "travellerId" TEXT NOT NULL,
    "role" "TravellerRole" NOT NULL DEFAULT 'ADULT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_travellers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_travellers_organizationId_idx" ON "trip_travellers"("organizationId");

-- CreateIndex
CREATE INDEX "trip_travellers_travellerId_idx" ON "trip_travellers"("travellerId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_travellers_tripId_travellerId_key" ON "trip_travellers"("tripId", "travellerId");

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_travellers" ADD CONSTRAINT "trip_travellers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_travellers" ADD CONSTRAINT "trip_travellers_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_travellers" ADD CONSTRAINT "trip_travellers_travellerId_fkey" FOREIGN KEY ("travellerId") REFERENCES "passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: trip membership from the legacy trips.passengerIds JSON array.
INSERT INTO "trip_travellers" ("id", "organizationId", "tripId", "travellerId", "role", "position", "createdAt")
SELECT 'tt_' || md5(t."id" || ':' || p."id"), t."organizationId", t."id", p."id", 'ADULT', x.ord - 1, NOW()
FROM "trips" t
CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(t."passengerIds") = 'array' THEN t."passengerIds" ELSE '[]'::jsonb END) WITH ORDINALITY AS x(pid, ord)
JOIN "passengers" p ON p."id" = x.pid AND p."organizationId" = t."organizationId"
ON CONFLICT ("tripId", "travellerId") DO NOTHING;

-- Seed the PAX display-id sequence so new travellers continue after existing PAX-YYYY-NNNN ids.
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT c."organizationId" || '-PAX-' || yr, c."organizationId", 'PAX', yr, maxn, NOW()
FROM (
  SELECT "organizationId", split_part("id", '-', 2) AS yr, MAX(split_part("id", '-', 3)::int) AS maxn
  FROM "passengers"
  WHERE "id" ~ '^PAX-[0-9]{4}-[0-9]+$'
  GROUP BY 1, 2
) c
ON CONFLICT ("organizationId", "docType", "financialYear")
DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");
