-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "tripId" TEXT,
    "customerId" TEXT,
    "vendorId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issueDate" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "guestNames" TEXT,
    "destination" TEXT,
    "hotelName" TEXT,
    "hotelAddress" TEXT,
    "hotelPhone" TEXT,
    "checkIn" TEXT,
    "checkOut" TEXT,
    "roomType" TEXT,
    "mealPlan" TEXT,
    "confirmationNo" TEXT,
    "nights" INTEGER,
    "pickupPoint" TEXT,
    "dropPoint" TEXT,
    "pickupDate" TEXT,
    "pickupTime" TEXT,
    "vehicleType" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "flightInfo" TEXT,
    "activityName" TEXT,
    "activityDate" TEXT,
    "activityTime" TEXT,
    "activityVenue" TEXT,
    "activityNotes" TEXT,
    "airline" TEXT,
    "flightNumber" TEXT,
    "pnr" TEXT,
    "departure" TEXT,
    "arrival" TEXT,
    "departureDate" TEXT,
    "arrivalDate" TEXT,
    "flightClass" TEXT,
    "visaType" TEXT,
    "country" TEXT,
    "entryType" TEXT,
    "validity" TEXT,
    "visaFee" DOUBLE PRECISION,
    "vendorName" TEXT,
    "vendorPhone" TEXT,
    "vendorEmail" TEXT,
    "pax" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "emergencyContact" TEXT,
    "internalNotes" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_voucherNumber_key" ON "vouchers"("voucherNumber");

-- CreateIndex
CREATE INDEX "vouchers_tripId_idx" ON "vouchers"("tripId");

-- CreateIndex
CREATE INDEX "vouchers_vendorId_idx" ON "vouchers"("vendorId");

-- CreateIndex
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");

-- CreateIndex
CREATE INDEX "vouchers_type_idx" ON "vouchers"("type");
