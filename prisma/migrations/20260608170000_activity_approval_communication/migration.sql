-- Rename ActivityLog columns to match new central activity architecture
ALTER TABLE "activity_logs" RENAME COLUMN "type" TO "action";
ALTER TABLE "activity_logs" RENAME COLUMN "message" TO "description";

-- New structured fields for richer timeline entries
ALTER TABLE "activity_logs" ADD COLUMN "title" TEXT;
ALTER TABLE "activity_logs" ADD COLUMN "metadata" JSONB;
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

-- Communication history tracking (Phase 4)
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "communications_entityType_entityId_idx" ON "communications"("entityType", "entityId");
CREATE INDEX "communications_type_idx" ON "communications"("type");

-- Quotation approval workflow (Phase 3)
ALTER TABLE "quotations" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "quotations" ADD COLUMN "approvalComment" TEXT;
ALTER TABLE "quotations" ADD COLUMN "submittedBy" TEXT;
ALTER TABLE "quotations" ADD COLUMN "submittedAt" TEXT;
ALTER TABLE "quotations" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "quotations" ADD COLUMN "approvedAt" TEXT;
CREATE INDEX "quotations_approvalStatus_idx" ON "quotations"("approvalStatus");
