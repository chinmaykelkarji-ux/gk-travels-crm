-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "booking_contracts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "contractNumber" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'CONFIRMED',
    "salesQuoteId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "partyId" TEXT,
    "partyName" TEXT,
    "tripId" TEXT,
    "destination" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "travellerIds" JSONB NOT NULL DEFAULT '[]',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gstMode" "GstMode" NOT NULL DEFAULT 'EXCLUDED',
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "paymentPolicy" TEXT,
    "cancellationPolicy" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_schedule_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "contractId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_contracts_tripId_key" ON "booking_contracts"("tripId");

-- CreateIndex
CREATE INDEX "booking_contracts_organizationId_idx" ON "booking_contracts"("organizationId");

-- CreateIndex
CREATE INDEX "booking_contracts_salesQuoteId_idx" ON "booking_contracts"("salesQuoteId");

-- CreateIndex
CREATE INDEX "booking_contracts_customerId_idx" ON "booking_contracts"("customerId");

-- CreateIndex
CREATE INDEX "booking_contracts_status_idx" ON "booking_contracts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "booking_contracts_organizationId_contractNumber_key" ON "booking_contracts"("organizationId", "contractNumber");

-- CreateIndex
CREATE INDEX "payment_schedule_items_organizationId_idx" ON "payment_schedule_items"("organizationId");

-- CreateIndex
CREATE INDEX "payment_schedule_items_dueDate_idx" ON "payment_schedule_items"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payment_schedule_items_contractId_seq_key" ON "payment_schedule_items"("contractId", "seq");

-- AddForeignKey
ALTER TABLE "booking_contracts" ADD CONSTRAINT "booking_contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_contracts" ADD CONSTRAINT "booking_contracts_salesQuoteId_fkey" FOREIGN KEY ("salesQuoteId") REFERENCES "sales_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_contracts" ADD CONSTRAINT "booking_contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_contracts" ADD CONSTRAINT "booking_contracts_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedule_items" ADD CONSTRAINT "payment_schedule_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedule_items" ADD CONSTRAINT "payment_schedule_items_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed the trip-id sequence (GK-YYYY-NNNN) from trips already created by the legacy client-side counter.
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT c."organizationId" || '-GK-' || yr, c."organizationId", 'GK', yr, maxn, NOW()
FROM (SELECT "organizationId", split_part("id", '-', 2) AS yr, MAX(split_part("id", '-', 3)::int) AS maxn FROM "trips" WHERE "id" ~ '^GK-[0-9]{4}-[0-9]+$' GROUP BY 1, 2) c
ON CONFLICT ("organizationId", "docType", "financialYear") DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");
