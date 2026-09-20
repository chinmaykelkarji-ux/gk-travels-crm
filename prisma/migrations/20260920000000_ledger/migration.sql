-- Phase 4.0: the ledger. Double-entry books: accounts, balanced
-- transactions and their lines. Nothing posted is edited or deleted; a
-- mistake is corrected by a reversal (reversalOfId) that mirrors it.
-- The chart of accounts is seeded by the API (ensureAccounts) from
-- src/shared/calc/ledger.ts, so new accounts arrive with the code.
-- Reverse: DROP TABLE "ledger_lines", "ledger_transactions", "ledger_accounts"; DROP TYPE "AccountType";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'Other',
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "displayNumber" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "narration" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "tripId" TEXT,
    "contractId" TEXT,
    "customerId" TEXT,
    "vendorId" TEXT,
    "reversalOfId" TEXT,
    "reversalReason" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'HUMAN',

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "customerId" TEXT,
    "vendorId" TEXT,
    "tripId" TEXT,
    "contractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_accounts_organizationId_idx" ON "ledger_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_organizationId_code_key" ON "ledger_accounts"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_reversalOfId_key" ON "ledger_transactions"("reversalOfId");

-- CreateIndex
CREATE INDEX "ledger_transactions_organizationId_date_idx" ON "ledger_transactions"("organizationId", "date");

-- CreateIndex
CREATE INDEX "ledger_transactions_sourceType_sourceId_idx" ON "ledger_transactions"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ledger_transactions_tripId_idx" ON "ledger_transactions"("tripId");

-- CreateIndex
CREATE INDEX "ledger_transactions_contractId_idx" ON "ledger_transactions"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_organizationId_displayNumber_key" ON "ledger_transactions"("organizationId", "displayNumber");

-- CreateIndex
CREATE INDEX "ledger_lines_organizationId_accountCode_idx" ON "ledger_lines"("organizationId", "accountCode");

-- CreateIndex
CREATE INDEX "ledger_lines_transactionId_idx" ON "ledger_lines"("transactionId");

-- CreateIndex
CREATE INDEX "ledger_lines_tripId_idx" ON "ledger_lines"("tripId");

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "booking_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
