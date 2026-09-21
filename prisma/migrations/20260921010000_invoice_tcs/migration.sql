-- Phase 4.5: TCS on overseas packages recorded on the invoice, and a flag
-- saying the invoice is for an overseas package (used to add up a customer's
-- overseas billing in the financial year). Additive; existing invoices stay
-- as they are with no TCS.
-- Reverse: ALTER TABLE "invoices" DROP COLUMN "isOverseas", DROP COLUMN "tcsAmount", DROP COLUMN "tcsRate";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "isOverseas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tcsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tcsRate" DECIMAL(5,2);
