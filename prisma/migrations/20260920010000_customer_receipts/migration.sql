-- Phase 4.1: customer receipts and refunds, recorded per family party
-- (contractId) where there is one, otherwise against the trip. Every row
-- carries its ledger posting (ledgerTransactionId); cancelling reverses the
-- posting and keeps the row. legacyPaymentId makes the import of the classic
-- payments table idempotent.
-- Reverse: DROP TABLE "customer_receipts"; DROP TYPE "ReceiptKind", "ReceiptMode";

-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('RECEIPT', 'REFUND');

-- CreateEnum
CREATE TYPE "ReceiptMode" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'GATEWAY', 'OTHER');

-- CreateTable
CREATE TABLE "customer_receipts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "kind" "ReceiptKind" NOT NULL DEFAULT 'RECEIPT',
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "contractId" TEXT,
    "tripId" TEXT,
    "customerId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "mode" "ReceiptMode" NOT NULL,
    "receivedAt" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "ledgerTransactionId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "legacyPaymentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_receipts_ledgerTransactionId_key" ON "customer_receipts"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "customer_receipts_organizationId_receivedAt_idx" ON "customer_receipts"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "customer_receipts_contractId_idx" ON "customer_receipts"("contractId");

-- CreateIndex
CREATE INDEX "customer_receipts_tripId_idx" ON "customer_receipts"("tripId");

-- CreateIndex
CREATE INDEX "customer_receipts_customerId_idx" ON "customer_receipts"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_receipts_organizationId_legacyPaymentId_key" ON "customer_receipts"("organizationId", "legacyPaymentId");

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
