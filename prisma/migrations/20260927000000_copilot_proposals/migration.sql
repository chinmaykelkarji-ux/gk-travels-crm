-- Phase 6.2: a copilot write is a proposal a person approves or rejects.
-- Additive: five nullable/defaulted columns on ai_actions; existing rows
-- read as DONE (every earlier call was a read).
-- Reverse: ALTER TABLE "ai_actions" DROP COLUMN "callId", DROP COLUMN "rejectedAt", DROP COLUMN "rejectedById", DROP COLUMN "result", DROP COLUMN "status";

-- AlterTable
ALTER TABLE "ai_actions" ADD COLUMN     "callId" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "result" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DONE';

