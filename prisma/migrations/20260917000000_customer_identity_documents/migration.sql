-- Customer identity documents + lookup indexes
--
-- WHY: src/modules/customers/Customers.tsx has always submitted passportNo,
-- passportExpiry and panNumber, but the `customers` table has no such columns.
-- Prisma rejected the entire write with a validation error, the route returned
-- 500, and the optimistic Zustand store still showed "Customer added" — so any
-- customer saved with passport or PAN details was silently lost.
--
-- Aadhaar is deliberately not added: UIDAI rules restrict retention and nothing
-- in the product collects it.
--
-- SAFETY: purely additive. All columns are nullable with no default, so this
-- rewrites no rows and takes no long lock. Indexes use CONCURRENTLY and must
-- therefore run OUTSIDE a transaction (see the note at the bottom).
--
-- ORDER MATTERS — run this BEFORE shipping the code that uses the columns.
-- Prisma names every model column in its RETURNING clause, so declaring a
-- column the database does not have breaks every customer READ, not just
-- writes. The shipped code therefore does not reference these columns yet.
--
-- AFTER running this file:
--   1. Uncomment passportNo / passportExpiry / passportCountry / panNumber
--      in the Customer model in prisma/schema.prisma.
--   2. Add the same four names to WRITABLE_FIELDS in
--      server/src/routes/customers.ts.
--   3. Commit and deploy. Passport and PAN entry then persists correctly.
--
-- Until then customer saves succeed (the route drops the unknown fields
-- instead of failing the whole write) but passport/PAN values are discarded.

-- ── Identity document columns ────────────────────────────────────────────
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "passportNo"      TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "passportExpiry"  TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "passportCountry" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "panNumber"       TEXT;

-- ── Lookup indexes ───────────────────────────────────────────────────────
-- Duplicate detection on import and the customer search both scan these two
-- columns today. Neither was indexed.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- `prisma migrate deploy` wraps each migration in one, so run these two
-- statements MANUALLY in the Neon SQL console, then apply the rest.
-- If you prefer a single transactional migration, drop CONCURRENTLY — the
-- customers table is small enough that the brief lock is harmless.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_phone_idx" ON "customers"("phone");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_email_idx" ON "customers"("email");
