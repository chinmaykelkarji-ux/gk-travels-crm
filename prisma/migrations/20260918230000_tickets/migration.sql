-- Phase 3.3: tickets (ticket -> segments -> passenger rows). Additive.

-- CreateEnum
CREATE TYPE "TicketMode" AS ENUM ('FLIGHT', 'TRAIN', 'BUS');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('REQUESTED', 'ON_HOLD', 'CONFIRMED', 'PARTIAL', 'WAITLISTED', 'RAC', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PassengerStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITLISTED', 'RAC', 'CANCELLED');

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "displayNumber" TEXT,
    "tripId" TEXT,
    "contractId" TEXT,
    "customerId" TEXT,
    "mode" "TicketMode" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'REQUESTED',
    "pnr" TEXT,
    "carrier" TEXT,
    "bookingRef" TEXT,
    "quota" TEXT,
    "travelClass" TEXT,
    "vendorId" TEXT,
    "baseFare" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceFeeGstPct" DECIMAL(5,2),
    "serviceFeeGst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalFare" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "sourceDocumentId" TEXT,
    "chartPrepared" BOOLEAN NOT NULL DEFAULT false,
    "chartCheckedAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "legacyBookingId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_segments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "ticketId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "carrierNumber" TEXT,
    "carrierName" TEXT,
    "fromCode" TEXT,
    "fromName" TEXT NOT NULL,
    "toCode" TEXT,
    "toName" TEXT NOT NULL,
    "departAt" TIMESTAMP(3),
    "arriveAt" TIMESTAMP(3),
    "travelClass" TEXT,
    "boardingPoint" TEXT,
    "droppingPoint" TEXT,
    "terminal" TEXT,
    "platform" TEXT,
    "baggage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_passengers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "ticketId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "paxIndex" INTEGER NOT NULL,
    "travellerId" TEXT,
    "name" TEXT NOT NULL,
    "paxType" TEXT NOT NULL DEFAULT 'ADULT',
    "age" INTEGER,
    "gender" TEXT,
    "status" "PassengerStatus" NOT NULL DEFAULT 'PENDING',
    "bookingStatus" TEXT,
    "currentStatus" TEXT,
    "waitlistPosition" INTEGER,
    "coach" TEXT,
    "seat" TEXT,
    "berth" TEXT,
    "ticketNumber" TEXT,
    "boardingPoint" TEXT,
    "fare" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tickets_tripId_idx" ON "tickets"("tripId");

-- CreateIndex
CREATE INDEX "tickets_customerId_idx" ON "tickets"("customerId");

-- CreateIndex
CREATE INDEX "tickets_organizationId_pnr_idx" ON "tickets"("organizationId", "pnr");

-- CreateIndex
CREATE INDEX "tickets_organizationId_status_idx" ON "tickets"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_organizationId_displayNumber_key" ON "tickets"("organizationId", "displayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_organizationId_legacyBookingId_key" ON "tickets"("organizationId", "legacyBookingId");

-- CreateIndex
CREATE INDEX "ticket_segments_organizationId_departAt_idx" ON "ticket_segments"("organizationId", "departAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_segments_ticketId_seq_key" ON "ticket_segments"("ticketId", "seq");

-- CreateIndex
CREATE INDEX "ticket_passengers_ticketId_idx" ON "ticket_passengers"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_passengers_travellerId_idx" ON "ticket_passengers"("travellerId");

-- CreateIndex
CREATE INDEX "ticket_passengers_organizationId_idx" ON "ticket_passengers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_passengers_segmentId_paxIndex_key" ON "ticket_passengers"("segmentId", "paxIndex");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_segments" ADD CONSTRAINT "ticket_segments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_segments" ADD CONSTRAINT "ticket_segments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_passengers" ADD CONSTRAINT "ticket_passengers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_passengers" ADD CONSTRAINT "ticket_passengers_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_passengers" ADD CONSTRAINT "ticket_passengers_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "ticket_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_passengers" ADD CONSTRAINT "ticket_passengers_travellerId_fkey" FOREIGN KEY ("travellerId") REFERENCES "passengers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

