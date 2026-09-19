-- Phase 3.2: trip operational records (hotel bookings, vehicle assignments,
-- activity bookings) and the trip's operational stage. Additive.

-- CreateEnum
CREATE TYPE "TripStage" AS ENUM ('PLANNING', 'CONFIRMING', 'READY', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpsStatus" AS ENUM ('REQUESTED', 'ON_HOLD', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DriverDutyStatus" AS ENUM ('ASSIGNED', 'ACKNOWLEDGED', 'STARTED', 'ARRIVED', 'ON_BOARD', 'COMPLETED', 'ISSUE');

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "stage" "TripStage" NOT NULL DEFAULT 'PLANNING';

-- CreateTable
CREATE TABLE "hotel_bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "tripId" TEXT NOT NULL,
    "contractId" TEXT,
    "hotelId" TEXT,
    "hotelName" TEXT NOT NULL,
    "city" TEXT,
    "roomTypeId" TEXT,
    "roomTypeName" TEXT,
    "mealPlan" "MealPlan",
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "travellerIds" JSONB NOT NULL DEFAULT '[]',
    "status" "OpsStatus" NOT NULL DEFAULT 'REQUESTED',
    "confirmationNo" TEXT,
    "vendorId" TEXT,
    "costAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "requestedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "legacyBookingId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "tripId" TEXT NOT NULL,
    "contractId" TEXT,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "vendorId" TEXT,
    "vehicleType" TEXT,
    "seatsRequired" INTEGER,
    "vehicleRegNo" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "pickupPoint" TEXT,
    "dropPoint" TEXT,
    "route" TEXT,
    "pax" INTEGER NOT NULL DEFAULT 0,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "driverStatus" "DriverDutyStatus" NOT NULL DEFAULT 'ASSIGNED',
    "driverStatusAt" TIMESTAMP(3),
    "driverNote" TEXT,
    "confirmationNo" TEXT,
    "costAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "legacyBookingId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "tripId" TEXT NOT NULL,
    "contractId" TEXT,
    "activityId" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "date" DATE NOT NULL,
    "time" TEXT,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "status" "OpsStatus" NOT NULL DEFAULT 'REQUESTED',
    "confirmationNo" TEXT,
    "vendorId" TEXT,
    "costAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "legacyBookingId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotel_bookings_tripId_idx" ON "hotel_bookings"("tripId");

-- CreateIndex
CREATE INDEX "hotel_bookings_organizationId_checkIn_idx" ON "hotel_bookings"("organizationId", "checkIn");

-- CreateIndex
CREATE INDEX "hotel_bookings_organizationId_status_idx" ON "hotel_bookings"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_bookings_organizationId_legacyBookingId_key" ON "hotel_bookings"("organizationId", "legacyBookingId");

-- CreateIndex
CREATE INDEX "vehicle_assignments_tripId_idx" ON "vehicle_assignments"("tripId");

-- CreateIndex
CREATE INDEX "vehicle_assignments_vehicleId_startAt_idx" ON "vehicle_assignments"("vehicleId", "startAt");

-- CreateIndex
CREATE INDEX "vehicle_assignments_driverId_startAt_idx" ON "vehicle_assignments"("driverId", "startAt");

-- CreateIndex
CREATE INDEX "vehicle_assignments_organizationId_startAt_idx" ON "vehicle_assignments"("organizationId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_assignments_organizationId_legacyBookingId_key" ON "vehicle_assignments"("organizationId", "legacyBookingId");

-- CreateIndex
CREATE INDEX "activity_bookings_tripId_idx" ON "activity_bookings"("tripId");

-- CreateIndex
CREATE INDEX "activity_bookings_organizationId_date_idx" ON "activity_bookings"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "activity_bookings_organizationId_legacyBookingId_key" ON "activity_bookings"("organizationId", "legacyBookingId");

-- CreateIndex
CREATE INDEX "trips_organizationId_stage_idx" ON "trips"("organizationId", "stage");

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "hotel_room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Backfill (Phase 3.2) ─────────────────────────────────────
-- Operational stage from the classic trip status. Unknown statuses stay PLANNING.
UPDATE "trips" SET "stage" = CASE lower(trim(coalesce("status", '')))
    WHEN 'confirmed'   THEN 'CONFIRMING'::"TripStage"
    WHEN 'in_progress' THEN 'ONGOING'::"TripStage"
    WHEN 'completed'   THEN 'COMPLETED'::"TripStage"
    WHEN 'cancelled'   THEN 'CANCELLED'::"TripStage"
    ELSE 'PLANNING'::"TripStage"
  END;
