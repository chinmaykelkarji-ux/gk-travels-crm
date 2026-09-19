-- Phase 3.1: operations masters (hotels, room types, season rates, vehicles, drivers,
-- activities) and vendor kinds. Additive; backfills at the end.

-- CreateEnum
CREATE TYPE "VendorKind" AS ENUM ('DMC', 'AIR_CONSOLIDATOR', 'HOTEL', 'TRANSPORT', 'ACTIVITY', 'GUIDE', 'VISA', 'INSURANCE', 'RAIL_BUS_AGENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MealPlan" AS ENUM ('EP', 'CP', 'MAP', 'AP', 'AI');

-- CreateEnum
CREATE TYPE "VehicleOwnership" AS ENUM ('OWNED', 'VENDOR');

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "creditDays" INTEGER,
ADD COLUMN     "kind" "VendorKind" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "phoneNormalized" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "hotels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "category" TEXT,
    "vendorId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_room_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxAdults" INTEGER NOT NULL DEFAULT 2,
    "maxChildren" INTEGER NOT NULL DEFAULT 1,
    "mealPlans" JSONB NOT NULL DEFAULT '["CP"]',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_rates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "roomTypeId" TEXT NOT NULL,
    "mealPlan" "MealPlan" NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "costPerNight" DECIMAL(12,2) NOT NULL,
    "sellPerNight" DECIMAL(12,2),
    "extraAdult" DECIMAL(12,2),
    "extraChild" DECIMAL(12,2),
    "gstRatePct" DECIMAL(5,2),
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "registrationNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "ownership" "VehicleOwnership" NOT NULL DEFAULT 'OWNED',
    "vendorId" TEXT,
    "defaultDriverId" TEXT,
    "insuranceExpiry" DATE,
    "permitExpiry" DATE,
    "fitnessExpiry" DATE,
    "pucExpiry" DATE,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT,
    "altPhone" TEXT,
    "vendorId" TEXT,
    "userId" TEXT,
    "licenceNo" TEXT,
    "licenceExpiry" DATE,
    "languages" JSONB NOT NULL DEFAULT '[]',
    "address" TEXT,
    "emergencyContact" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "category" TEXT,
    "vendorId" TEXT,
    "durationMinutes" INTEGER,
    "description" TEXT,
    "inclusions" TEXT,
    "costAdult" DECIMAL(12,2),
    "costChild" DECIMAL(12,2),
    "sellAdult" DECIMAL(12,2),
    "sellChild" DECIMAL(12,2),
    "minPax" INTEGER,
    "maxPax" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotels_organizationId_city_idx" ON "hotels"("organizationId", "city");

-- CreateIndex
CREATE INDEX "hotels_organizationId_name_idx" ON "hotels"("organizationId", "name");

-- CreateIndex
CREATE INDEX "hotels_vendorId_idx" ON "hotels"("vendorId");

-- CreateIndex
CREATE INDEX "hotel_room_types_organizationId_idx" ON "hotel_room_types"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_room_types_hotelId_name_key" ON "hotel_room_types"("hotelId", "name");

-- CreateIndex
CREATE INDEX "hotel_rates_organizationId_idx" ON "hotel_rates"("organizationId");

-- CreateIndex
CREATE INDEX "hotel_rates_roomTypeId_mealPlan_validFrom_idx" ON "hotel_rates"("roomTypeId", "mealPlan", "validFrom");

-- CreateIndex
CREATE INDEX "vehicles_vendorId_idx" ON "vehicles"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organizationId_registrationNo_key" ON "vehicles"("organizationId", "registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE INDEX "drivers_organizationId_phoneNormalized_idx" ON "drivers"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "drivers_vendorId_idx" ON "drivers"("vendorId");

-- CreateIndex
CREATE INDEX "activities_organizationId_city_idx" ON "activities"("organizationId", "city");

-- CreateIndex
CREATE INDEX "activities_vendorId_idx" ON "activities"("vendorId");

-- CreateIndex
CREATE INDEX "vendors_organizationId_kind_idx" ON "vendors"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "vendors_organizationId_phoneNormalized_idx" ON "vendors"("organizationId", "phoneNormalized");

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_types" ADD CONSTRAINT "hotel_room_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_types" ADD CONSTRAINT "hotel_room_types_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_rates" ADD CONSTRAINT "hotel_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_rates" ADD CONSTRAINT "hotel_rates_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "hotel_room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_defaultDriverId_fkey" FOREIGN KEY ("defaultDriverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Backfills (Phase 3.1) ────────────────────────────────────

-- Vendor kind from the classic free-text "type" (mirrors kindFromLegacyType in src/shared/contracts/masters.ts).
UPDATE "vendors" SET "kind" = CASE lower(trim(coalesce("type", '')))
    WHEN 'hotel'     THEN 'HOTEL'::"VendorKind"
    WHEN 'transport' THEN 'TRANSPORT'::"VendorKind"
    WHEN 'cab'       THEN 'TRANSPORT'::"VendorKind"
    WHEN 'activity'  THEN 'ACTIVITY'::"VendorKind"
    WHEN 'guide'     THEN 'GUIDE'::"VendorKind"
    WHEN 'visa'      THEN 'VISA'::"VendorKind"
    WHEN 'dmc'       THEN 'DMC'::"VendorKind"
    WHEN 'insurance' THEN 'INSURANCE'::"VendorKind"
    WHEN 'airline'   THEN 'AIR_CONSOLIDATOR'::"VendorKind"
    WHEN 'flight'    THEN 'AIR_CONSOLIDATOR'::"VendorKind"
    ELSE 'OTHER'::"VendorKind"
  END;

-- Normalised vendor phone for duplicate detection (mirrors src/shared/calc/phone.ts).
UPDATE "vendors" SET "phoneNormalized" = sub.n FROM (
  SELECT "id",
    CASE
      WHEN d = '' THEN NULL
      WHEN d LIKE '0091%' AND length(d) > 6 THEN substr(d, 5)
      WHEN length(d) = 12 AND d LIKE '91%' THEN substr(d, 3)
      WHEN length(d) = 11 AND d LIKE '0%' THEN substr(d, 2)
      WHEN length(d) >= 6 THEN d
      ELSE NULL
    END AS n
  FROM (SELECT "id", regexp_replace(coalesce("phone", ''), '\D', '', 'g') AS d FROM "vendors") x
) sub WHERE "vendors"."id" = sub."id";

-- Seed the VEN display-id sequence so server-created vendors continue after existing VEN-YYYY-NNNN ids.
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT v."organizationId" || '-VEN-' || yr, v."organizationId", 'VEN', yr, maxn, NOW()
FROM (
  SELECT "organizationId", split_part("id", '-', 2) AS yr, MAX(split_part("id", '-', 3)::int) AS maxn
  FROM "vendors"
  WHERE "id" ~ '^VEN-[0-9]{4}-[0-9]+$'
  GROUP BY 1, 2
) v
ON CONFLICT ("organizationId", "docType", "financialYear")
DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");
