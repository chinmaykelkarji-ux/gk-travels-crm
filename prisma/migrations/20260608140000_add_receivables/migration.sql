-- Standalone Accounts Receivable ledger — independent of the existing
-- Payment model. A Receivable is an invoice/amount-due record; one or more
-- ReceivableEntry rows record amounts collected against it over time
-- (supports partial and full payments).

CREATE TABLE "receivables" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "bookingId" TEXT,
    "tripId" TEXT,
    "invoiceAmount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dueDate" TEXT,
    "totalReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receivable_entries" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentDate" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "receivables_customerId_idx" ON "receivables"("customerId");
CREATE INDEX "receivables_bookingId_idx" ON "receivables"("bookingId");
CREATE INDEX "receivables_tripId_idx" ON "receivables"("tripId");
CREATE INDEX "receivable_entries_receivableId_idx" ON "receivable_entries"("receivableId");

ALTER TABLE "receivable_entries" ADD CONSTRAINT "receivable_entries_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
