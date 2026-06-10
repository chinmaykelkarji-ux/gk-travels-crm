-- Dynamic customer ledger aggregation
--
-- Problem: Trip.balanceDue / Booking.balanceDue / Receivable.balanceDue are
-- cached aggregates recalculated by application code on every edit. If an
-- edit/delete path is ever missed, a customer's outstanding balance can
-- drift from reality.
--
-- Fix: "customer_ledger_balances" is a plain SQL view (not materialized) —
-- it joins customers -> receivables -> receivable_entries and sums them on
-- every read. There is nothing to cache and nothing to go stale: editing or
-- deleting a receivable, or adding/editing/deleting a receivable_entry, is
-- reflected the moment the view is queried. Customers with zero invoices
-- come back with zero totals via the LEFT JOINs + COALESCE.

-- ── Indexes: customer foreign keys used by the aggregation join ──
CREATE INDEX IF NOT EXISTS "trips_customerId_idx"    ON "trips"("customerId");
CREATE INDEX IF NOT EXISTS "bookings_customerId_idx" ON "bookings"("customerId");

-- ── Indexes: monetary "outstanding balance" columns ──
-- Partial indexes — only customers/trips/bookings/receivables that are
-- actually outstanding need to be scanned for dues/overdue lists.
CREATE INDEX IF NOT EXISTS "trips_balanceDue_idx"
  ON "trips"("balanceDue") WHERE "balanceDue" > 0;
CREATE INDEX IF NOT EXISTS "bookings_balanceDue_idx"
  ON "bookings"("balanceDue") WHERE "balanceDue" > 0;
CREATE INDEX IF NOT EXISTS "receivables_balanceDue_idx"
  ON "receivables"("balanceDue") WHERE "balanceDue" > 0;

-- Composite index supporting the per-receivable SUM(amount) aggregation
CREATE INDEX IF NOT EXISTS "receivable_entries_receivableId_amount_idx"
  ON "receivable_entries"("receivableId", "amount");

-- ── Dynamic ledger view ──
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
