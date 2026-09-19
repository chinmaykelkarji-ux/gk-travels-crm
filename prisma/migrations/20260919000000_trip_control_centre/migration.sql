-- Phase 3.4: trip control centre. A trip can hold several booking contracts
-- (one per family party); pickup points; party and pickup point per traveller.

-- DropIndex
DROP INDEX "booking_contracts_tripId_key";

-- AlterTable
ALTER TABLE "trip_travellers" ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "pickupPointId" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "assignedOpsUserId" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "isInternational" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stageChangedAt" TIMESTAMP(3),
ADD COLUMN     "tourName" TEXT;

-- CreateTable
CREATE TABLE "trip_pickup_points" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "tripId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "landmark" TEXT,
    "pickupAt" TIMESTAMP(3),
    "contactName" TEXT,
    "contactPhone" TEXT,
    "mapUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_pickup_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_pickup_points_tripId_idx" ON "trip_pickup_points"("tripId");

-- CreateIndex
CREATE INDEX "trip_pickup_points_organizationId_idx" ON "trip_pickup_points"("organizationId");

-- CreateIndex
CREATE INDEX "booking_contracts_tripId_idx" ON "booking_contracts"("tripId");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_assignedOpsUserId_fkey" FOREIGN KEY ("assignedOpsUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_travellers" ADD CONSTRAINT "trip_travellers_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_travellers" ADD CONSTRAINT "trip_travellers_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "trip_pickup_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_pickup_points" ADD CONSTRAINT "trip_pickup_points_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_pickup_points" ADD CONSTRAINT "trip_pickup_points_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Backfill (Phase 3.4) ─────────────────────────────────────
-- Party membership: travellers listed on a booking contract belong to that party on its trip.
UPDATE "trip_travellers" tt SET "contractId" = c."id"
FROM "booking_contracts" c
WHERE c."tripId" = tt."tripId"
  AND tt."contractId" IS NULL
  AND jsonb_typeof(c."travellerIds") = 'array'
  AND c."travellerIds" ? tt."travellerId";

-- Stage timestamp for trips that already moved past planning.
UPDATE "trips" SET "stageChangedAt" = "updatedAt" WHERE "stage" <> 'PLANNING' AND "stageChangedAt" IS NULL;
