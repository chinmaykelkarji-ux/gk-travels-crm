-- Phase 2.8: carry legacy "quotations" (client-side builder) into the unified
-- engine on sales_quotes. Idempotent: rows already migrated (sq_legacy_<id>)
-- are skipped, so re-running is safe. The legacy tables stay untouched for
-- the /legacy screens until they are retired.

-- Phone normalisation identical to src/shared/calc/phone.ts (Indian numbers: strip 0091 / 91 / leading 0).
CREATE OR REPLACE FUNCTION travelos_normalize_phone(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN d LIKE '0091%' AND length(d) > 6 THEN substr(d, 5)
    WHEN length(d) = 12 AND d LIKE '91%' THEN substr(d, 3)
    WHEN length(d) = 11 AND d LIKE '0%' THEN substr(d, 2)
    WHEN length(d) >= 6 THEN d
    ELSE NULL
  END
  FROM (SELECT regexp_replace(coalesce(raw, ''), '\D', '', 'g') AS d) x
$$;

-- 1. Customers for legacy quotations that have no customerId: match by phone, else create.
INSERT INTO "customers" ("id", "organizationId", "name", "phone", "phoneNormalized", "email", "createdDate", "source", "createdAt", "updatedAt")
SELECT 'cus_legacy_' || q."id", q."organizationId", q."customerName", COALESCE(q."customerPhone", ''),
       travelos_normalize_phone(q."customerPhone"), q."customerEmail", q."createdDate", 'Legacy quotation', q."createdAt", NOW()
FROM "quotations" q
WHERE q."customerId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "sales_quotes" s WHERE s."id" = 'sq_legacy_' || q."id")
  AND NOT EXISTS (SELECT 1 FROM "customers" c WHERE c."organizationId" = q."organizationId" AND c."deletedAt" IS NULL
                  AND c."phoneNormalized" IS NOT NULL AND c."phoneNormalized" = travelos_normalize_phone(q."customerPhone"))
  AND NOT EXISTS (SELECT 1 FROM "customers" c WHERE c."id" = 'cus_legacy_' || q."id");

-- 2. One enquiry per legacy quotation.
INSERT INTO "enquiries" ("id", "organizationId", "customerId", "source", "destination", "departureDate", "returnDate", "pax", "adults", "requirements", "status",
                         "enquiryNumber", "notes", "createdAt", "updatedAt", "wonAt", "lostAt", "lostReason", "priority", "preferences", "children", "infants", "flexibleDates")
SELECT 'enq_legacy_' || q."id", q."organizationId",
       COALESCE(q."customerId",
                (SELECT c."id" FROM "customers" c WHERE c."organizationId" = q."organizationId" AND c."deletedAt" IS NULL AND c."phoneNormalized" IS NOT NULL
                   AND c."phoneNormalized" = travelos_normalize_phone(q."customerPhone") ORDER BY c."createdAt" LIMIT 1),
                'cus_legacy_' || q."id"),
       'DIRECT', q."destination",
       CASE WHEN q."startDate" ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(q."startDate", 10)::timestamp END,
       CASE WHEN q."endDate"   ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(q."endDate", 10)::timestamp END,
       GREATEST(q."pax", 1), GREATEST(q."pax", 1), q."notes",
       CASE q."status" WHEN 'accepted' THEN 'WON' WHEN 'rejected' THEN 'LOST' WHEN 'expired' THEN 'LOST' WHEN 'sent' THEN 'QUOTED' ELSE 'IN_PROGRESS' END::"EnquiryStatus",
       'ENQ-LEGACY-' || q."id", 'Migrated from legacy quotation ' || q."quotationNumber", q."createdAt", NOW(),
       CASE WHEN q."status" = 'accepted' THEN q."updatedAt" END,
       CASE WHEN q."status" IN ('rejected', 'expired') THEN q."updatedAt" END,
       CASE WHEN q."status" = 'rejected' THEN 'Legacy quotation rejected' WHEN q."status" = 'expired' THEN 'Legacy quotation expired' END,
       'medium', '{}'::jsonb, 0, 0, false
FROM "quotations" q
WHERE NOT EXISTS (SELECT 1 FROM "sales_quotes" s WHERE s."id" = 'sq_legacy_' || q."id")
  AND NOT EXISTS (SELECT 1 FROM "enquiries" e WHERE e."id" = 'enq_legacy_' || q."id");

-- 3. The quotation itself. Totals follow the legacy GST mode: EXCLUDED adds GST on top of totalSelling; INCLUDED treats totalSelling as gross.
INSERT INTO "sales_quotes" ("id", "organizationId", "enquiryId", "quoteNumber", "customerId", "status", "validUntil", "subtotal", "discountAmount", "taxAmount", "totalAmount",
                            "notes", "termsConditions", "sentAt", "convertedAt", "convertedTripId", "createdAt", "updatedAt",
                            "title", "version", "isCurrent", "adults", "children", "infants", "gstMode", "gstRate", "taxableAmount", "costAmount",
                            "inclusions", "exclusions", "paymentPolicy", "approvalStatus", "approvalComment", "approvedBy", "approvedAt", "acceptedAt", "rejectedAt", "totalsCache")
SELECT 'sq_legacy_' || q."id", q."organizationId", 'enq_legacy_' || q."id", q."quotationNumber", e."customerId",
       CASE q."status" WHEN 'sent' THEN 'SENT' WHEN 'accepted' THEN 'ACCEPTED' WHEN 'rejected' THEN 'REJECTED' WHEN 'expired' THEN 'EXPIRED' ELSE 'DRAFT' END::"SalesQuoteStatus",
       COALESCE(CASE WHEN q."validUntil" ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(q."validUntil", 10)::timestamp END, q."createdAt" + interval '7 days'),
       q."totalSelling", 0, q."gstAmount",
       CASE WHEN q."gstMode" = 'INCLUDED' THEN q."totalSelling" ELSE q."totalSelling" + q."gstAmount" END,
       q."notes", q."termsAndConds",
       CASE WHEN q."sentAt" ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(q."sentAt", 19)::timestamp END,
       CASE WHEN q."convertedAt" ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(q."convertedAt", 19)::timestamp END,
       q."convertedTripId", q."createdAt", NOW(),
       q."destination", 1, true, GREATEST(q."pax", 1), 0, 0, q."gstMode", q."gstRate",
       CASE WHEN q."gstMode" = 'INCLUDED' THEN q."totalSelling" - q."gstAmount" ELSE q."totalSelling" END, q."totalCost",
       q."inclusions", q."exclusions", q."paymentPolicy",
       CASE q."approvalStatus" WHEN 'APPROVED' THEN 'APPROVED' WHEN 'PENDING' THEN 'PENDING' WHEN 'SUBMITTED' THEN 'PENDING' WHEN 'REJECTED' THEN 'REJECTED' ELSE 'NOT_REQUIRED' END,
       q."approvalComment", q."approvedBy",
       CASE WHEN q."approvedAt" ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(q."approvedAt", 19)::timestamp END,
       CASE WHEN q."acceptedAt" ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(q."acceptedAt", 19)::timestamp END,
       CASE WHEN q."rejectedAt" ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(q."rejectedAt", 19)::timestamp END,
       '{}'::jsonb
FROM "quotations" q
JOIN "enquiries" e ON e."id" = 'enq_legacy_' || q."id"
WHERE NOT EXISTS (SELECT 1 FROM "sales_quotes" s WHERE s."id" = 'sq_legacy_' || q."id")
  AND NOT EXISTS (SELECT 1 FROM "sales_quotes" s WHERE s."organizationId" = q."organizationId" AND s."quoteNumber" = q."quotationNumber");

-- 4. Items, priced per unit (quantity × price), supplier kept when the vendor still exists.
INSERT INTO "sales_quote_items" ("id", "organizationId", "salesQuoteId", "serviceType", "description", "supplierId", "costPrice", "markup", "sellPrice", "quantity", "unit", "details", "sortOrder", "createdAt",
                                 "pricingBasis", "isSelectedOption")
SELECT 'sqi_legacy_' || i."id", i."organizationId", 'sq_legacy_' || i."quotationId",
       CASE i."category" WHEN 'hotel' THEN 'HOTEL' WHEN 'flight' THEN 'FLIGHT' WHEN 'transfer' THEN 'TRANSFER' WHEN 'activity' THEN 'ACTIVITY' WHEN 'visa' THEN 'VISA' WHEN 'insurance' THEN 'INSURANCE' ELSE 'OTHER' END::"ServiceType",
       COALESCE(NULLIF(i."description", ''), i."category"),
       (SELECT v."id" FROM "vendors" v WHERE v."id" = i."vendorId"),
       i."costPrice", GREATEST(i."sellingPrice" - i."costPrice", 0), i."sellingPrice", GREATEST(i."quantity", 1), 'per unit',
       jsonb_build_object('legacyItemId', i."id", 'vendorName', i."vendorName"), i."sortOrder", i."createdAt",
       'PER_UNIT'::"PricingBasis", true
FROM "quotation_items" i
JOIN "sales_quotes" s ON s."id" = 'sq_legacy_' || i."quotationId"
WHERE NOT EXISTS (SELECT 1 FROM "sales_quote_items" x WHERE x."id" = 'sqi_legacy_' || i."id");
