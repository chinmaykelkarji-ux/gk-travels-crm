-- Phase 4.4: tax rules. Rates the business charges, each with the day it
-- starts, so a change is a new row and old invoices still explain
-- themselves. The catalogue lives in src/shared/calc/tax.ts; rows here are
-- what the owner has set.
-- The backfill below carries the ticketing service-fee rate that used to sit
-- in organizations.settings (taxes.ticketServiceFeeGstPct) into a rule, so
-- nothing changes for the owner on deploy.
-- Reverse: DROP TABLE "tax_rules";

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "code" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "threshold" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_rules_organizationId_code_idx" ON "tax_rules"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rules_organizationId_code_effectiveFrom_key" ON "tax_rules"("organizationId", "code", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry the old setting (or the documented 18% default) into a rule.
INSERT INTO "tax_rules" ("id", "organizationId", "code", "rate", "threshold", "enabled", "effectiveFrom", "note", "createdAt", "updatedAt")
SELECT
  md5(o."id" || 'GST_TICKET_SERVICE_FEE')::text,
  o."id",
  'GST_TICKET_SERVICE_FEE',
  COALESCE((o."settings" #>> '{taxes,ticketServiceFeeGstPct}')::numeric, 18),
  0,
  true,
  DATE '2000-04-01',
  'Carried over from settings on upgrade — verify with CA.',
  NOW(),
  NOW()
FROM "organizations" o
ON CONFLICT ("organizationId", "code", "effectiveFrom") DO NOTHING;
