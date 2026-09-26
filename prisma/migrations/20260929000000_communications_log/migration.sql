-- Phase 7.2: communications becomes the one log per record — messages TravelOS
-- sends (queued, sent, delivered, read, failed) beside the ones a person opened
-- in their own app. Additive: new nullable/defaulted columns and indexes; the
-- existing rows are marked as opened in an app (via APP, status LOGGED) and
-- get their channel from `type`.
-- Reverse: DROP INDEX "communications_organizationId_tripId_idx", "communications_organizationId_customerId_idx", "communications_providerMessageId_idx", "communications_organizationId_status_idx";
--          ALTER TABLE "communications" DROP COLUMN "channel", DROP COLUMN "via", DROP COLUMN "direction", DROP COLUMN "status", DROP COLUMN "statusReason", DROP COLUMN "templateKey", DROP COLUMN "body", DROP COLUMN "params", DROP COLUMN "customerId", DROP COLUMN "tripId", DROP COLUMN "source", DROP COLUMN "providerMessageId", DROP COLUMN "attempts", DROP COLUMN "sentAt", DROP COLUMN "deliveredAt", DROP COLUMN "readAt", DROP COLUMN "failedAt", DROP COLUMN "automationRunId", DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "communications" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "automationRunId" TEXT,
ADD COLUMN     "body" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'OUT',
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "params" JSONB,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'HUMAN',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'LOGGED',
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "templateKey" TEXT,
ADD COLUMN     "tripId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "via" TEXT NOT NULL DEFAULT 'APP';

-- CreateIndex
CREATE INDEX "communications_organizationId_tripId_idx" ON "communications"("organizationId", "tripId");

-- CreateIndex
CREATE INDEX "communications_organizationId_customerId_idx" ON "communications"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "communications_providerMessageId_idx" ON "communications"("providerMessageId");

-- CreateIndex
CREATE INDEX "communications_organizationId_status_idx" ON "communications"("organizationId", "status");


-- Backfill: the rows logged before this change were opened in a person's own app.
UPDATE "communications" SET "channel" = UPPER("type") WHERE "channel" IS NULL AND "type" IN ('whatsapp', 'email');
