-- Phase 3.7: DRIVER role for the driver view (/driver). Additive.
-- A DRIVER session is fenced to /api/v2/driver, /api/v2/me and /api/auth
-- (server/src/middleware/auth.ts) and holds only the driver:duties permission.
-- Reverse: Postgres cannot drop an enum value; first set any DRIVER users to
--          another role (UPDATE "users" SET "role" = 'OPERATIONS', "isActive" = false WHERE "role" = 'DRIVER'), then leave the unused value.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DRIVER';
