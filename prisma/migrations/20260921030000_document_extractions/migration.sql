-- Phase 5.2: what a model read out of a document, and the proposal a person
-- approves. Additive: one new table, no existing row is touched. A document
-- with no extraction behaves exactly as before.
-- Reverse: DROP TABLE "document_extractions";

-- CreateTable
CREATE TABLE "document_extractions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "step" TEXT NOT NULL DEFAULT 'classify',
    "kind" TEXT,
    "kindConfidence" TEXT,
    "kindReason" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "fields" JSONB,
    "matches" JSONB,
    "proposal" JSONB,
    "tripId" TEXT,
    "vendorId" TEXT,
    "appliedKind" TEXT,
    "appliedId" TEXT,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_extractions_organizationId_status_idx" ON "document_extractions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "document_extractions_documentId_idx" ON "document_extractions"("documentId");

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

