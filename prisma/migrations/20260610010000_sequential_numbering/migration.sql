-- Sequential display numbers for Customers and Trips
--
-- Adds "Customer #N" / "Trip #N" display numbers, generated exclusively by
-- PostgreSQL via dedicated per-table sequences (Int @unique
-- @default(autoincrement()) in schema.prisma). Sequences are atomic under
-- concurrent inserts and never reuse a value, even after a row is deleted —
-- numbers are guaranteed never to repeat and always continue from the last
-- assigned value across restarts/redeploys/restores.
--
-- Existing rows are backfilled in creation order (oldest first = #1) so
-- current customers/trips keep stable, ordered numbers; each sequence is
-- then advanced past the backfilled max so new rows continue seamlessly.

-- ── Customers ────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS "customers_customerNumber_seq";

ALTER TABLE "customers" ADD COLUMN "customerNumber" INTEGER;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS "rn"
  FROM "customers"
)
UPDATE "customers" c
SET "customerNumber" = ordered."rn"
FROM ordered
WHERE c."id" = ordered."id";

SELECT setval('"customers_customerNumber_seq"', COALESCE((SELECT MAX("customerNumber") FROM "customers"), 0), true);

ALTER TABLE "customers" ALTER COLUMN "customerNumber" SET DEFAULT nextval('"customers_customerNumber_seq"'::regclass);
ALTER TABLE "customers" ALTER COLUMN "customerNumber" SET NOT NULL;
ALTER SEQUENCE "customers_customerNumber_seq" OWNED BY "customers"."customerNumber";

CREATE UNIQUE INDEX "customers_customerNumber_key" ON "customers"("customerNumber");

-- ── Trips ────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS "trips_tripNumber_seq";

ALTER TABLE "trips" ADD COLUMN "tripNumber" INTEGER;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS "rn"
  FROM "trips"
)
UPDATE "trips" t
SET "tripNumber" = ordered."rn"
FROM ordered
WHERE t."id" = ordered."id";

SELECT setval('"trips_tripNumber_seq"', COALESCE((SELECT MAX("tripNumber") FROM "trips"), 0), true);

ALTER TABLE "trips" ALTER COLUMN "tripNumber" SET DEFAULT nextval('"trips_tripNumber_seq"'::regclass);
ALTER TABLE "trips" ALTER COLUMN "tripNumber" SET NOT NULL;
ALTER SEQUENCE "trips_tripNumber_seq" OWNED BY "trips"."tripNumber";

CREATE UNIQUE INDEX "trips_tripNumber_key" ON "trips"("tripNumber");
