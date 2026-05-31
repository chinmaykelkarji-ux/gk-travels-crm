-- ============================================================
-- Migration: fix_user_auth_schema
--
-- What was broken:
--   • The users table was created with column "password" (TEXT)
--     but Prisma schema now expects "passwordHash" (no @map means
--     the column name = the field name exactly).
--   • The "role" column was TEXT; schema now uses a Role enum.
--   • A stale "UserRole" enum may exist from a failed attempt.
--
-- What this migration does (safely, without losing existing rows):
--   1. Drop any leftover UserRole enum from a previous failed run
--   2. Create the new "Role" enum type
--   3. Rename column  password  →  "passwordHash"
--   4. Convert column "role" from TEXT to "Role" enum
-- ============================================================

-- 1. Clean up any leftover enum from a previous failed migration attempt
DROP TYPE IF EXISTS "UserRole";

-- 2. Create the Role enum (ADMIN, SALES, OPERATIONS, ACCOUNTS)
DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES', 'OPERATIONS', 'ACCOUNTS');
EXCEPTION
  WHEN duplicate_object THEN NULL; -- already exists, skip
END $$;

-- 3. Rename the "password" column to "passwordHash"
--    (safe even if already renamed — will error if column doesn't exist,
--     which is caught by the DO block below)
DO $$ BEGIN
  ALTER TABLE "users" RENAME COLUMN "password" TO "passwordHash";
EXCEPTION
  WHEN undefined_column THEN NULL; -- already renamed, skip
END $$;

-- 4a. Drop the TEXT default before changing column type
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

-- 4b. Cast "role" TEXT values to the Role enum
--     Existing values 'ADMIN', 'SALES', 'OPERATIONS', 'ACCOUNTS' cast directly.
--     Any unknown value becomes 'ADMIN' as a safe fallback.
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role"
  USING (
    CASE
      WHEN "role" IN ('ADMIN', 'SALES', 'OPERATIONS', 'ACCOUNTS')
        THEN "role"::"Role"
      ELSE 'ADMIN'::"Role"
    END
  );

-- 4c. Restore the enum default
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'ADMIN'::"Role";
