-- Phase 7.0: message templates, one row per key and channel per organisation.
-- Additive: one new table. System templates are inserted by the application
-- (modules/templates) when an organisation first opens them, never overwritten.
-- Reverse: DROP TABLE "message_templates";

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "metaTemplateName" TEXT,
    "metaLanguage" TEXT NOT NULL DEFAULT 'en',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_templates_organizationId_idx" ON "message_templates"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_organizationId_key_channel_key" ON "message_templates"("organizationId", "key", "channel");

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

