-- Document numbers (invoice, credit/debit note, quotation, sales quote, voucher)
-- are unique per organisation, not globally: two tenants may both issue
-- GK/2026-27/01. Replaces the global unique indexes with (organizationId, number).

-- DropIndex
DROP INDEX "credit_notes_creditNoteNumber_key";

-- DropIndex
DROP INDEX "debit_notes_debitNoteNumber_key";

-- DropIndex
DROP INDEX "invoices_invoiceNumber_key";

-- DropIndex
DROP INDEX "quotations_quotationNumber_key";

-- DropIndex
DROP INDEX "sales_quotes_quoteNumber_key";

-- DropIndex
DROP INDEX "vouchers_voucherNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_organizationId_creditNoteNumber_key" ON "credit_notes"("organizationId", "creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_organizationId_debitNoteNumber_key" ON "debit_notes"("organizationId", "debitNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_invoiceNumber_key" ON "invoices"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_organizationId_quotationNumber_key" ON "quotations"("organizationId", "quotationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotes_organizationId_quoteNumber_key" ON "sales_quotes"("organizationId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_organizationId_voucherNumber_key" ON "vouchers"("organizationId", "voucherNumber");

