-- Phase 4.2: supplier bills and the payments that settle them.
-- A bill posts its cost to an expense account (by category), holds any GST
-- as input credit and owes the supplier; a payment with no billId is an
-- advance held in "Advances to suppliers" until a bill arrives. Every row
-- carries its ledger posting; cancelling reverses it and keeps the row.
-- legacyPayableId / legacyPaymentId make the import of the classic payables
-- and supplier payments idempotent.
-- Reverse: DROP TABLE "vendor_bill_payments", "vendor_bills";

-- CreateTable
CREATE TABLE "vendor_bills" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "vendorId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billDate" DATE NOT NULL,
    "dueDate" DATE,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "tripId" TEXT,
    "contractId" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "documentId" TEXT,
    "ledgerTransactionId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "legacyPayableId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bill_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "vendorId" TEXT NOT NULL,
    "billId" TEXT,
    "tripId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "mode" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "ledgerTransactionId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "legacyPaymentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_bill_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bills_ledgerTransactionId_key" ON "vendor_bills"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "vendor_bills_organizationId_billDate_idx" ON "vendor_bills"("organizationId", "billDate");

-- CreateIndex
CREATE INDEX "vendor_bills_vendorId_idx" ON "vendor_bills"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_bills_tripId_idx" ON "vendor_bills"("tripId");

-- CreateIndex
CREATE INDEX "vendor_bills_status_idx" ON "vendor_bills"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bills_organizationId_legacyPayableId_key" ON "vendor_bills"("organizationId", "legacyPayableId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bill_payments_ledgerTransactionId_key" ON "vendor_bill_payments"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "vendor_bill_payments_organizationId_paidAt_idx" ON "vendor_bill_payments"("organizationId", "paidAt");

-- CreateIndex
CREATE INDEX "vendor_bill_payments_vendorId_idx" ON "vendor_bill_payments"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_bill_payments_billId_idx" ON "vendor_bill_payments"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bill_payments_organizationId_legacyPaymentId_key" ON "vendor_bill_payments"("organizationId", "legacyPaymentId");

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_payments" ADD CONSTRAINT "vendor_bill_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_payments" ADD CONSTRAINT "vendor_bill_payments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_payments" ADD CONSTRAINT "vendor_bill_payments_billId_fkey" FOREIGN KEY ("billId") REFERENCES "vendor_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_payments" ADD CONSTRAINT "vendor_bill_payments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
