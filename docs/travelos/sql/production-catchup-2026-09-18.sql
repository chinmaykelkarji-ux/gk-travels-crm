-- Production catch-up SQL — run ONCE in the Neon SQL editor before baselining.
-- Generated 2026-09-18 from the read-only snapshot prisma/introspected/production-2026-09-18.prisma.
-- Every statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE); nothing is dropped.
-- After running it, follow docs/travelos/RUNBOOK-production-cutover.md step 3.

-- AlterTable
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "panNumber" TEXT,
ADD COLUMN IF NOT EXISTS "passportCountry" TEXT,
ADD COLUMN IF NOT EXISTS "passportExpiry" TEXT,
ADD COLUMN IF NOT EXISTS "passportNo" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leads_assignedTo_idx" ON "leads"("assignedTo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leads_followUpDate_idx" ON "leads"("followUpDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_departure_idx" ON "trips"("departure");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_customerId_idx" ON "trips"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_invoiceId_idx" ON "trips"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookings_refId_idx" ON "bookings"("refId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookings_type_idx" ON "bookings"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookings_customerId_idx" ON "bookings"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookings_invoiceId_idx" ON "bookings"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_tripId_idx" ON "payments"("tripId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_customerId_idx" ON "payments"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_bookingId_idx" ON "payments"("bookingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_type_status_idx" ON "payments"("type", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_date_idx" ON "payments"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tasks_tripId_idx" ON "tasks"("tripId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tasks_status_dueDate_idx" ON "tasks"("status", "dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tasks_assignedTo_idx" ON "tasks"("assignedTo");

-- ── Dynamic customer ledger view (Prisma does not manage views) ─────────────
CREATE OR REPLACE VIEW "customer_ledger_balances" AS
SELECT
  c."id"                                            AS "customerId",
  c."name"                                          AS "customerName",
  COALESCE(inv."invoiceTotal", 0)                   AS "totalInvoiced",
  COALESCE(rcv."receivedTotal", 0)                  AS "totalReceived",
  ROUND(
    (COALESCE(inv."invoiceTotal", 0) - COALESCE(rcv."receivedTotal", 0))::numeric,
    2
  )                                                  AS "balanceDue",
  COALESCE(inv."openInvoiceCount", 0)               AS "openInvoiceCount",
  rcv."lastPaymentDate"                             AS "lastPaymentDate"
FROM "customers" c
LEFT JOIN (
  SELECT
    "customerId",
    SUM("invoiceAmount")                       AS "invoiceTotal",
    COUNT(*) FILTER (WHERE "balanceDue" > 0)   AS "openInvoiceCount"
  FROM "receivables"
  WHERE "customerId" IS NOT NULL
  GROUP BY "customerId"
) inv ON inv."customerId" = c."id"
LEFT JOIN (
  SELECT
    r."customerId"           AS "customerId",
    SUM(re."amount")         AS "receivedTotal",
    MAX(re."paymentDate")    AS "lastPaymentDate"
  FROM "receivables" r
  JOIN "receivable_entries" re ON re."receivableId" = r."id"
  WHERE r."customerId" IS NOT NULL
  GROUP BY r."customerId"
) rcv ON rcv."customerId" = c."id";
