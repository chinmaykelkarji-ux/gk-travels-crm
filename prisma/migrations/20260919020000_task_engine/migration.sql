-- Phase 3.6: task engine. Rule-generated tasks (source RULE, ruleCode,
-- unique ruleKey), precise due times, snooze, user assignment, completion
-- stamps; task_rules holds the organisation's rule settings.
-- Backfills: completedAt from the classic completedDate; assignedToUserId
-- from the classic assignee name where exactly one user has that name; open
-- passport alerts raised by the old scheduler are closed with a reason (the
-- engine raises the same tasks under its own keys on its first run).
-- Reverse: DROP TABLE "task_rules"; ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignedToUserId_fkey";
--          DROP INDEX "tasks_organizationId_ruleKey_key", "tasks_status_dueAt_idx", "tasks_assignedToUserId_idx";
--          ALTER TABLE "tasks" DROP COLUMN "assignedByUserId", DROP COLUMN "assignedToUserId", DROP COLUMN "autoClosedAt",
--            DROP COLUMN "closeReason", DROP COLUMN "completedAt", DROP COLUMN "completedById", DROP COLUMN "dueAt",
--            DROP COLUMN "entityId", DROP COLUMN "entityType", DROP COLUMN "ruleCode", DROP COLUMN "ruleKey",
--            DROP COLUMN "snoozedUntil", DROP COLUMN "source";
--          (reopen the closed passport alerts with:
--           UPDATE "tasks" SET "status" = 'pending' WHERE "closeReason" = 'Replaced by the task engine';)

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "assignedByUserId" TEXT,
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "autoClosedAt" TIMESTAMP(3),
ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "ruleCode" TEXT,
ADD COLUMN     "ruleKey" TEXT,
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "task_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_rules_organizationId_idx" ON "task_rules"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "task_rules_organizationId_code_key" ON "task_rules"("organizationId", "code");

-- CreateIndex
CREATE INDEX "tasks_status_dueAt_idx" ON "tasks"("status", "dueAt");

-- CreateIndex
CREATE INDEX "tasks_assignedToUserId_idx" ON "tasks"("assignedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_organizationId_ruleKey_key" ON "tasks"("organizationId", "ruleKey");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_rules" ADD CONSTRAINT "task_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: completion time from the classic date (IST midnight).
UPDATE "tasks" SET "completedAt" = ("completedDate" || 'T00:00:00+05:30')::timestamptz
WHERE "completedAt" IS NULL AND "completedDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

-- Backfill: assignee by name when the name is unambiguous in the organisation.
UPDATE "tasks" t SET "assignedToUserId" = u."id"
FROM "users" u
WHERE t."assignedToUserId" IS NULL AND t."assignedTo" IS NOT NULL AND u."organizationId" = t."organizationId" AND u."name" = t."assignedTo"
  AND (SELECT COUNT(*) FROM "users" u2 WHERE u2."organizationId" = u."organizationId" AND u2."name" = u."name") = 1;

-- The old scheduler's passport alerts: the engine's PASSPORT_VALIDITY rule replaces them.
UPDATE "tasks" SET "status" = 'cancelled', "closeReason" = 'Replaced by the task engine', "completedAt" = NOW()
WHERE "id" LIKE 'SYS-TSK-%' AND "title" LIKE 'Passport %' AND "status" IN ('pending', 'in_progress') AND "source" = 'MANUAL';
