-- DropIndex
DROP INDEX "numbering_sequences_docType_financialYear_key";

-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'HUMAN';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "communications" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels',
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "credit_note_line_items" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "debit_note_line_items" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "debit_notes" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "enquiries" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "financial_transactions" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "invoice_line_items" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "itineraries" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "itinerary_days" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "message_logs" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "numbering_sequences" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "passengers" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "receivable_entries" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "sales_quote_items" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "sales_quotes" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "trip_services" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "vendor_payments" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- AlterTable
ALTER TABLE "vouchers" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_gktravels';

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- The single tenant every existing row belongs to. Must exist before the
-- organizationId foreign keys below are validated against the column default.
INSERT INTO "organizations" ("id", "slug", "name", "legalName", "currency", "timezone", "settings", "isActive", "createdAt", "updatedAt")
VALUES ('org_gktravels', 'org_gktravels', 'GK Travels', NULL, 'INR', 'Asia/Kolkata', '{}', true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "activity_logs_organizationId_idx" ON "activity_logs"("organizationId");

-- CreateIndex
CREATE INDEX "bookings_organizationId_idx" ON "bookings"("organizationId");

-- CreateIndex
CREATE INDEX "communications_organizationId_idx" ON "communications"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_organizationId_key" ON "company_settings"("organizationId");

-- CreateIndex
CREATE INDEX "company_settings_organizationId_idx" ON "company_settings"("organizationId");

-- CreateIndex
CREATE INDEX "credit_note_line_items_organizationId_idx" ON "credit_note_line_items"("organizationId");

-- CreateIndex
CREATE INDEX "credit_notes_organizationId_idx" ON "credit_notes"("organizationId");

-- CreateIndex
CREATE INDEX "customers_organizationId_idx" ON "customers"("organizationId");

-- CreateIndex
CREATE INDEX "debit_note_line_items_organizationId_idx" ON "debit_note_line_items"("organizationId");

-- CreateIndex
CREATE INDEX "debit_notes_organizationId_idx" ON "debit_notes"("organizationId");

-- CreateIndex
CREATE INDEX "enquiries_organizationId_idx" ON "enquiries"("organizationId");

-- CreateIndex
CREATE INDEX "financial_transactions_organizationId_idx" ON "financial_transactions"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_line_items_organizationId_idx" ON "invoice_line_items"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_organizationId_idx" ON "invoices"("organizationId");

-- CreateIndex
CREATE INDEX "itineraries_organizationId_idx" ON "itineraries"("organizationId");

-- CreateIndex
CREATE INDEX "itinerary_days_organizationId_idx" ON "itinerary_days"("organizationId");

-- CreateIndex
CREATE INDEX "leads_organizationId_idx" ON "leads"("organizationId");

-- CreateIndex
CREATE INDEX "message_logs_organizationId_idx" ON "message_logs"("organizationId");

-- CreateIndex
CREATE INDEX "numbering_sequences_organizationId_idx" ON "numbering_sequences"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "numbering_sequences_organizationId_docType_financialYear_key" ON "numbering_sequences"("organizationId", "docType", "financialYear");

-- CreateIndex
CREATE INDEX "outbox_events_organizationId_idx" ON "outbox_events"("organizationId");

-- CreateIndex
CREATE INDEX "passengers_organizationId_idx" ON "passengers"("organizationId");

-- CreateIndex
CREATE INDEX "payments_organizationId_idx" ON "payments"("organizationId");

-- CreateIndex
CREATE INDEX "quotation_items_organizationId_idx" ON "quotation_items"("organizationId");

-- CreateIndex
CREATE INDEX "quotations_organizationId_idx" ON "quotations"("organizationId");

-- CreateIndex
CREATE INDEX "receivable_entries_organizationId_idx" ON "receivable_entries"("organizationId");

-- CreateIndex
CREATE INDEX "receivables_organizationId_idx" ON "receivables"("organizationId");

-- CreateIndex
CREATE INDEX "reminders_organizationId_idx" ON "reminders"("organizationId");

-- CreateIndex
CREATE INDEX "sales_quote_items_organizationId_idx" ON "sales_quote_items"("organizationId");

-- CreateIndex
CREATE INDEX "sales_quotes_organizationId_idx" ON "sales_quotes"("organizationId");

-- CreateIndex
CREATE INDEX "tasks_organizationId_idx" ON "tasks"("organizationId");

-- CreateIndex
CREATE INDEX "trip_services_organizationId_idx" ON "trip_services"("organizationId");

-- CreateIndex
CREATE INDEX "trips_organizationId_idx" ON "trips"("organizationId");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "vendor_payments_organizationId_idx" ON "vendor_payments"("organizationId");

-- CreateIndex
CREATE INDEX "vendors_organizationId_idx" ON "vendors"("organizationId");

-- CreateIndex
CREATE INDEX "vouchers_organizationId_idx" ON "vouchers"("organizationId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_entries" ADD CONSTRAINT "receivable_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numbering_sequences" ADD CONSTRAINT "numbering_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_line_items" ADD CONSTRAINT "debit_note_line_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_services" ADD CONSTRAINT "trip_services_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_items" ADD CONSTRAINT "sales_quote_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Ledger view now carries organizationId so raw SQL can scope it ──────────
CREATE OR REPLACE VIEW "customer_ledger_balances" AS
SELECT
  c."id"                                            AS "customerId",
  c."name"                                          AS "customerName",
  COALESCE(inv."invoiceTotal", 0)                   AS "totalInvoiced",
  COALESCE(rcv."receivedTotal", 0)                  AS "totalReceived",
  ROUND(
    (COALESCE(inv."invoiceTotal", 0) - COALESCE(rcv."receivedTotal", 0))::numeric,
    2
  )                                                  AS "balanceDue",
  COALESCE(inv."openInvoiceCount", 0)               AS "openInvoiceCount",
  rcv."lastPaymentDate"                             AS "lastPaymentDate",
  c."organizationId"                                AS "organizationId"
FROM "customers" c
LEFT JOIN (
  SELECT
    "customerId",
    SUM("invoiceAmount")                       AS "invoiceTotal",
    COUNT(*) FILTER (WHERE "balanceDue" > 0)   AS "openInvoiceCount"
  FROM "receivables"
  WHERE "customerId" IS NOT NULL
  GROUP BY "customerId"
) inv ON inv."customerId" = c."id"
LEFT JOIN (
  SELECT
    r."customerId"           AS "customerId",
    SUM(re."amount")         AS "receivedTotal",
    MAX(re."paymentDate")    AS "lastPaymentDate"
  FROM "receivables" r
  JOIN "receivable_entries" re ON re."receivableId" = r."id"
  WHERE r."customerId" IS NOT NULL
  GROUP BY r."customerId"
) rcv ON rcv."customerId" = c."id";
