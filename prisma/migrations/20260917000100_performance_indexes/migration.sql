-- Missing indexes on the high-traffic legacy tables
--
-- WHY: leads, payments and tasks carry no index beyond their primary key, and
-- bookings.refId — the pointer every trip→booking rollup walks — is unindexed.
-- This is currently masked because GET /api/data/all loads whole tables and
-- filters in JavaScript. It stops being masked the moment that endpoint is
-- replaced with paginated, filtered queries, so these land first.
--
-- SAFETY: purely additive and non-locking. CREATE INDEX CONCURRENTLY does not
-- block reads or writes.
--
-- IMPORTANT: CONCURRENTLY cannot run inside a transaction block, and
-- `prisma migrate deploy` wraps each migration in one. Run this file MANUALLY
-- in the Neon SQL console (statement by statement, or with autocommit on).
-- Every statement is IF NOT EXISTS, so re-running it is harmless.

-- ── payments: every per-trip / per-customer lookup ───────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_tripId_idx"      ON "payments"("tripId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_customerId_idx"  ON "payments"("customerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_bookingId_idx"   ON "payments"("bookingId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_type_status_idx" ON "payments"("type", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_date_idx"        ON "payments"("date");

-- ── bookings: refId is the trip pointer used by every rollup ─────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookings_refId_idx"     ON "bookings"("refId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookings_status_idx"    ON "bookings"("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookings_type_idx"      ON "bookings"("type");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookings_invoiceId_idx" ON "bookings"("invoiceId");

-- ── tasks: the operations task list filters on all four ──────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_tripId_idx"      ON "tasks"("tripId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_status_due_idx"  ON "tasks"("status", "dueDate");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_assignedTo_idx"  ON "tasks"("assignedTo");

-- ── leads: no index at all today ─────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "leads_status_idx"       ON "leads"("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "leads_assignedTo_idx"   ON "leads"("assignedTo");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "leads_followUpDate_idx" ON "leads"("followUpDate");

-- ── trips: status and departure drive the dashboard and the scheduler ────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trips_status_idx"    ON "trips"("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trips_departure_idx" ON "trips"("departure");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trips_invoiceId_idx" ON "trips"("invoiceId");
