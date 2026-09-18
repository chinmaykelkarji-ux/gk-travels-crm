-- AlterTable
ALTER TABLE "enquiries" ADD COLUMN     "adults" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "budgetMax" DECIMAL(10,2),
ADD COLUMN     "children" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "enquiryNumber" TEXT,
ADD COLUMN     "flexibleDates" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hotelCategory" TEXT,
ADD COLUMN     "infants" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "mealPlan" TEXT,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "rooms" INTEGER,
ADD COLUMN     "tripType" TEXT,
ADD COLUMN     "wonAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "convertedEnquiryId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "phoneNormalized" TEXT;

-- CreateIndex
CREATE INDEX "enquiries_assignedToUserId_idx" ON "enquiries"("assignedToUserId");

-- CreateIndex
CREATE INDEX "enquiries_leadId_idx" ON "enquiries"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_organizationId_enquiryNumber_key" ON "enquiries"("organizationId", "enquiryNumber");

-- CreateIndex
CREATE INDEX "leads_assignedToUserId_idx" ON "leads"("assignedToUserId");

-- CreateIndex
CREATE INDEX "leads_organizationId_phoneNormalized_idx" ON "leads"("organizationId", "phoneNormalized");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: lead lifecycle v2 (new → contacted → qualified → converted; lost).
UPDATE "leads" SET "status" = CASE "status"
  WHEN 'follow_up' THEN 'contacted'
  WHEN 'quotation_sent' THEN 'qualified'
  WHEN 'confirmed' THEN 'converted'
  WHEN 'new' THEN 'new' WHEN 'contacted' THEN 'contacted' WHEN 'qualified' THEN 'qualified'
  WHEN 'converted' THEN 'converted' WHEN 'lost' THEN 'lost'
  ELSE 'new' END;

-- Backfill: normalised phone for duplicate detection (same rule as customers).
UPDATE "leads" SET "phoneNormalized" = sub.n FROM (
  SELECT "id",
    CASE
      WHEN d = '' THEN NULL
      WHEN d LIKE '0091%' AND length(d) > 6 THEN substr(d, 5)
      WHEN length(d) = 12 AND d LIKE '91%' THEN substr(d, 3)
      WHEN length(d) = 11 AND d LIKE '0%' THEN substr(d, 2)
      WHEN length(d) >= 6 THEN d
      ELSE NULL
    END AS n
  FROM (SELECT "id", regexp_replace(coalesce("phone", ''), '\D', '', 'g') AS d FROM "leads") x
) sub WHERE "leads"."id" = sub."id";

-- Backfill: adults = pax for existing enquiries; display numbers in creation order per year.
UPDATE "enquiries" SET "adults" = GREATEST("pax", 1) WHERE "adults" = 1 AND "pax" > 1;
UPDATE "enquiries" e SET "enquiryNumber" = 'ENQ-' || s.yr || '-' || lpad(s.rn::text, 4, '0')
FROM (
  SELECT "id", to_char("createdAt", 'YYYY') AS yr,
         row_number() OVER (PARTITION BY "organizationId", to_char("createdAt", 'YYYY') ORDER BY "createdAt", "id") AS rn
  FROM "enquiries"
) s WHERE e."id" = s."id" AND e."enquiryNumber" IS NULL;

-- Seed display-id sequences for leads (L-YYYY-NNNN ids) and enquiries (ENQ-YYYY-NNNN numbers).
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT c."organizationId" || '-L-' || yr, c."organizationId", 'L', yr, maxn, NOW()
FROM (SELECT "organizationId", split_part("id", '-', 2) AS yr, MAX(split_part("id", '-', 3)::int) AS maxn FROM "leads" WHERE "id" ~ '^L-[0-9]{4}-[0-9]+$' GROUP BY 1, 2) c
ON CONFLICT ("organizationId", "docType", "financialYear") DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT c."organizationId" || '-ENQ-' || yr, c."organizationId", 'ENQ', yr, maxn, NOW()
FROM (SELECT "organizationId", split_part("enquiryNumber", '-', 2) AS yr, MAX(split_part("enquiryNumber", '-', 3)::int) AS maxn FROM "enquiries" WHERE "enquiryNumber" ~ '^ENQ-[0-9]{4}-[0-9]+$' GROUP BY 1, 2) c
ON CONFLICT ("organizationId", "docType", "financialYear") DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");
