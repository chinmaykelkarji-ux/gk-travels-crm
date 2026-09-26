-- Phase 8: the customer portal — private links (only the token hash is kept)
-- and the feedback customers leave on their page. Additive: two new tables.
-- Reverse: DROP TABLE "feedback"; DROP TABLE "portal_access";

-- CreateTable
CREATE TABLE "portal_access" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "requireCode" BOOLEAN NOT NULL DEFAULT false,
    "codeChannel" TEXT,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeSentAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
    "tripId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comments" TEXT,
    "portalAccessId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_access_tokenHash_key" ON "portal_access"("tokenHash");

-- CreateIndex
CREATE INDEX "portal_access_organizationId_customerId_idx" ON "portal_access"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "feedback_organizationId_tripId_idx" ON "feedback"("organizationId", "tripId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_organizationId_tripId_customerId_key" ON "feedback"("organizationId", "tripId", "customerId");

-- AddForeignKey
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

