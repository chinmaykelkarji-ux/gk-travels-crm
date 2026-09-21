-- Phase 4.3: expenses paid directly (fuel, tolls, food on the road, tips,
-- office costs) and the reimbursements that pay staff back when they spent
-- their own money. Every row carries its ledger posting; cancelling reverses
-- it and keeps the row.
-- Reverse: DROP TABLE "staff_reimbursements", "expenses";

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidBy" TEXT NOT NULL,
    "paidByUserId" TEXT,
    "tripId" TEXT,
    "contractId" TEXT,
    "vendorId" TEXT,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "documentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "ledgerTransactionId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_reimbursements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "mode" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "ledgerTransactionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_reimbursements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expenses_ledgerTransactionId_key" ON "expenses"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "expenses_organizationId_date_idx" ON "expenses"("organizationId", "date");

-- CreateIndex
CREATE INDEX "expenses_tripId_idx" ON "expenses"("tripId");

-- CreateIndex
CREATE INDEX "expenses_paidByUserId_idx" ON "expenses"("paidByUserId");

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex
CREATE UNIQUE INDEX "staff_reimbursements_ledgerTransactionId_key" ON "staff_reimbursements"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "staff_reimbursements_organizationId_paidAt_idx" ON "staff_reimbursements"("organizationId", "paidAt");

-- CreateIndex
CREATE INDEX "staff_reimbursements_userId_idx" ON "staff_reimbursements"("userId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_reimbursements" ADD CONSTRAINT "staff_reimbursements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_reimbursements" ADD CONSTRAINT "staff_reimbursements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
