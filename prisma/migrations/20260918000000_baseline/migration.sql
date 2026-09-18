-- TravelOS baseline (2026-09-18).
--
-- Generated with `prisma migrate diff --from-empty --to-schema-datamodel` and
-- extended with the customer_ledger_balances view (views are not part of the
-- Prisma schema). Replaces the 14 hand-written folders that could not replay
-- on an empty database. docs/travelos/RUNBOOK-production-cutover.md explains
-- how production, which already has these tables, is marked as baselined.

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GstType" AS ENUM ('INTRA', 'INTER');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('RECEIVABLE', 'PAYMENT_RECEIVED', 'PAYABLE', 'PAYMENT_SENT', 'GST_OUTPUT', 'GST_INPUT', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'BOOKING', 'OPERATIONS', 'ACCOUNTS');

-- CreateEnum
CREATE TYPE "GstMode" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('FLIGHT', 'BUS', 'HOTEL', 'VEHICLE', 'ACTIVITY', 'TRANSFER', 'VISA', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('DRAFT', 'REQUESTED', 'PENDING', 'CONFIRMED', 'COMPLETED', 'VOUCHER_RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "EnquirySource" AS ENUM ('DIRECT', 'WHATSAPP', 'PHONE', 'EMAIL', 'REFERRAL', 'WEBSITE');

-- CreateEnum
CREATE TYPE "SalesQuoteStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "customerNumber" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "tripIds" JSONB NOT NULL DEFAULT '[]',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "createdDate" TEXT NOT NULL,
    "sourceLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billingAddress" TEXT,
    "companyName" TEXT,
    "gstNumber" TEXT,
    "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT,
    "passportNo" TEXT,
    "passportExpiry" TEXT,
    "passportCountry" TEXT,
    "panNumber" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" TEXT NOT NULL,
    "destination" TEXT NOT NULL DEFAULT '',
    "travelDate" TEXT,
    "pax" INTEGER NOT NULL DEFAULT 1,
    "budget" DOUBLE PRECISION,
    "tripType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "notes" TEXT NOT NULL DEFAULT '',
    "followUpDate" TEXT,
    "assignedTo" TEXT,
    "createdDate" TEXT NOT NULL,
    "convertedTripId" TEXT,
    "convertedCustomerId" TEXT,
    "convertedAt" TEXT,
    "convertedBy" TEXT,
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "tripNumber" SERIAL NOT NULL,
    "invoiceId" TEXT,
    "customer" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "customerId" TEXT,
    "destination" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Leisure',
    "pax" INTEGER NOT NULL DEFAULT 1,
    "departure" TEXT,
    "returnDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalAmount" DOUBLE PRECISION,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPayable" DOUBLE PRECISION,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marginPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visaStatus" TEXT NOT NULL DEFAULT 'pending',
    "hotelStatus" TEXT NOT NULL DEFAULT 'pending',
    "flightStatus" TEXT NOT NULL DEFAULT 'pending',
    "checkInStatus" TEXT NOT NULL DEFAULT 'not_due',
    "notes" TEXT NOT NULL DEFAULT '',
    "assignedTo" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdBy" TEXT,
    "sourceLeadId" TEXT,
    "convertedFromLeadId" TEXT,
    "convertedAt" TEXT,
    "convertedBy" TEXT,
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "itinerary" JSONB NOT NULL DEFAULT '[]',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gstMode" "GstMode" NOT NULL DEFAULT 'EXCLUDED',
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passengerIds" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "customerName" TEXT NOT NULL,
    "customerId" TEXT,
    "refId" TEXT,
    "sellingPrice" DOUBLE PRECISION,
    "supplierCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPayable" DOUBLE PRECISION,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierPending" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marginPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gstMode" "GstMode" NOT NULL DEFAULT 'EXCLUDED',
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "convenienceFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "financialStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "gstOnFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serviceMarginMode" BOOLEAN NOT NULL DEFAULT false,
    "passengerIds" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tripId" TEXT,
    "bookingId" TEXT,
    "customer" TEXT,
    "customerId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "paidDate" TEXT,
    "status" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "bookingId" TEXT,
    "tripId" TEXT,
    "invoiceId" TEXT,
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "type" "FinancialTransactionType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "customerId" TEXT,
    "vendorId" TEXT,
    "tripId" TEXT,
    "bookingId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "transactionDate" TEXT NOT NULL,
    "paymentMode" TEXT,
    "reference" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tripId" TEXT,
    "bookingId" TEXT,
    "customerId" TEXT,
    "dueDate" TEXT,
    "assignedTo" TEXT,
    "completedDate" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT,
    "timestamp" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "title" TEXT,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "type" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "destinations" JSONB NOT NULL DEFAULT '[]',
    "paymentTerms" TEXT,
    "bankDetails" JSONB NOT NULL DEFAULT '{}',
    "gstNumber" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "tripId" TEXT,
    "tripName" TEXT,
    "description" TEXT,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advancePaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outstanding" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" TEXT,
    "dueDate" TEXT,
    "notes" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "destination" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "pax" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "termsAndConds" TEXT,
    "validUntil" TEXT,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSelling" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marginPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "convertedTripId" TEXT,
    "convertedAt" TEXT,
    "createdDate" TEXT NOT NULL,
    "sentAt" TEXT,
    "acceptedAt" TEXT,
    "rejectedAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gstMode" "GstMode" NOT NULL DEFAULT 'EXCLUDED',
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exclusions" TEXT,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inclusions" TEXT,
    "paymentPolicy" TEXT,
    "approvalComment" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TEXT,
    "approvedBy" TEXT,
    "submittedAt" TEXT,
    "submittedBy" TEXT,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "vendorName" TEXT,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSelling" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marginPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itineraries" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "quotationId" TEXT,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "pax" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "emergencyContact" TEXT,
    "template" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passengerIds" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_days" (
    "id" TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" TEXT,
    "title" TEXT NOT NULL,
    "morning" TEXT,
    "afternoon" TEXT,
    "evening" TEXT,
    "hotelName" TEXT,
    "hotelAddress" TEXT,
    "meals" JSONB NOT NULL DEFAULT '[]',
    "transfers" TEXT,
    "activities" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "tripId" TEXT,
    "customerId" TEXT,
    "vendorId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issueDate" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "guestNames" TEXT,
    "destination" TEXT,
    "hotelName" TEXT,
    "hotelAddress" TEXT,
    "hotelPhone" TEXT,
    "checkIn" TEXT,
    "checkOut" TEXT,
    "roomType" TEXT,
    "mealPlan" TEXT,
    "confirmationNo" TEXT,
    "nights" INTEGER,
    "pickupPoint" TEXT,
    "dropPoint" TEXT,
    "pickupDate" TEXT,
    "pickupTime" TEXT,
    "vehicleType" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "flightInfo" TEXT,
    "activityName" TEXT,
    "activityDate" TEXT,
    "activityTime" TEXT,
    "activityVenue" TEXT,
    "activityNotes" TEXT,
    "operatorName" TEXT,
    "busType" TEXT,
    "busNumber" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "boardingPoint" TEXT,
    "droppingPoint" TEXT,
    "seatNumbers" TEXT,
    "duration" TEXT,
    "reportingTime" TEXT,
    "airline" TEXT,
    "flightNumber" TEXT,
    "pnr" TEXT,
    "departure" TEXT,
    "arrival" TEXT,
    "departureDate" TEXT,
    "arrivalDate" TEXT,
    "flightClass" TEXT,
    "visaType" TEXT,
    "country" TEXT,
    "entryType" TEXT,
    "validity" TEXT,
    "visaFee" DOUBLE PRECISION,
    "vendorName" TEXT,
    "vendorPhone" TEXT,
    "vendorEmail" TEXT,
    "pax" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "emergencyContact" TEXT,
    "internalNotes" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstMode" "GstMode" NOT NULL DEFAULT 'EXCLUDED',
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPayable" DOUBLE PRECISION,
    "passengerIds" JSONB NOT NULL DEFAULT '[]',
    "items" JSONB NOT NULL DEFAULT '[]',
    "gstType" TEXT NOT NULL DEFAULT 'INTRA',
    "placeOfSupplyStateCode" TEXT,
    "voucherDate" TEXT,
    "customerCompany" TEXT,
    "customerAddress" TEXT,
    "customerGstin" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentMethod" TEXT,
    "costPrice" DOUBLE PRECISION,
    "sellingPrice" DOUBLE PRECISION,
    "showPricing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "dateOfBirth" TEXT,
    "nationality" TEXT,
    "gender" TEXT,
    "passportNumber" TEXT,
    "passportIssueDate" TEXT,
    "passportExpiry" TEXT,
    "placeOfIssue" TEXT,
    "visaStatus" TEXT,
    "visaExpiry" TEXT,
    "visaCountry" TEXT,
    "visaType" TEXT,
    "frequentFlyerNumber" TEXT,
    "mealPreference" TEXT,
    "seatPreference" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyRelation" TEXT,
    "notes" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT 'GK Travels',
    "legalName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankBranch" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'GK',
    "invoiceTerms" TEXT,
    "authorizedSignatory" TEXT,
    "signatureUrl" TEXT,
    "gstFrozenUntil" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numbering_sequences" (
    "id" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "numbering_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "invoiceDate" TEXT NOT NULL,
    "dueDate" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "customerGstin" TEXT,
    "customerStateCode" TEXT,
    "placeOfSupply" TEXT,
    "companyName" TEXT NOT NULL,
    "companyAddress" TEXT,
    "companyGstin" TEXT,
    "companyStateCode" TEXT,
    "gstType" "GstType" NOT NULL DEFAULT 'INTRA',
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "termsAndConds" TEXT,
    "bookingIds" JSONB NOT NULL DEFAULT '[]',
    "tripIds" JSONB NOT NULL DEFAULT '[]',
    "receivableId" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdBy" TEXT,
    "cancelledAt" TEXT,
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsnSac" TEXT,
    "serviceType" TEXT,
    "bookingId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'ISSUED',
    "date" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonDetails" TEXT,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdBy" TEXT,
    "cancelledAt" TEXT,
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_line_items" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsnSac" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_note_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" TEXT NOT NULL,
    "debitNoteNumber" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'ISSUED',
    "date" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonDetails" TEXT,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdDate" TEXT NOT NULL,
    "createdBy" TEXT,
    "cancelledAt" TEXT,
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_note_line_items" (
    "id" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsnSac" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "debit_note_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_services" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'DRAFT',
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "supplierId" TEXT,
    "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "customerId" TEXT,
    "channel" TEXT NOT NULL,
    "templateName" TEXT,
    "recipient" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiries" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "source" "EnquirySource" NOT NULL DEFAULT 'DIRECT',
    "destination" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "pax" INTEGER NOT NULL DEFAULT 1,
    "requirements" TEXT,
    "budget" DECIMAL(10,2),
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotes" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "SalesQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "termsConditions" TEXT,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "convertedTripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quote_items" (
    "id" TEXT NOT NULL,
    "salesQuoteId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "description" TEXT NOT NULL,
    "supplierId" TEXT,
    "costPrice" DECIMAL(10,2) NOT NULL,
    "markup" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'per person',
    "details" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customerNumber_key" ON "customers"("customerNumber");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_assignedTo_idx" ON "leads"("assignedTo");

-- CreateIndex
CREATE INDEX "leads_followUpDate_idx" ON "leads"("followUpDate");

-- CreateIndex
CREATE UNIQUE INDEX "trips_tripNumber_key" ON "trips"("tripNumber");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_departure_idx" ON "trips"("departure");

-- CreateIndex
CREATE INDEX "trips_customerId_idx" ON "trips"("customerId");

-- CreateIndex
CREATE INDEX "trips_invoiceId_idx" ON "trips"("invoiceId");

-- CreateIndex
CREATE INDEX "bookings_refId_idx" ON "bookings"("refId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_type_idx" ON "bookings"("type");

-- CreateIndex
CREATE INDEX "bookings_customerId_idx" ON "bookings"("customerId");

-- CreateIndex
CREATE INDEX "bookings_invoiceId_idx" ON "bookings"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_tripId_idx" ON "payments"("tripId");

-- CreateIndex
CREATE INDEX "payments_customerId_idx" ON "payments"("customerId");

-- CreateIndex
CREATE INDEX "payments_bookingId_idx" ON "payments"("bookingId");

-- CreateIndex
CREATE INDEX "payments_type_status_idx" ON "payments"("type", "status");

-- CreateIndex
CREATE INDEX "payments_date_idx" ON "payments"("date");

-- CreateIndex
CREATE INDEX "receivables_customerId_idx" ON "receivables"("customerId");

-- CreateIndex
CREATE INDEX "receivables_bookingId_idx" ON "receivables"("bookingId");

-- CreateIndex
CREATE INDEX "receivables_tripId_idx" ON "receivables"("tripId");

-- CreateIndex
CREATE INDEX "receivables_invoiceId_idx" ON "receivables"("invoiceId");

-- CreateIndex
CREATE INDEX "receivable_entries_receivableId_idx" ON "receivable_entries"("receivableId");

-- CreateIndex
CREATE INDEX "financial_transactions_customerId_idx" ON "financial_transactions"("customerId");

-- CreateIndex
CREATE INDEX "financial_transactions_vendorId_idx" ON "financial_transactions"("vendorId");

-- CreateIndex
CREATE INDEX "financial_transactions_tripId_idx" ON "financial_transactions"("tripId");

-- CreateIndex
CREATE INDEX "financial_transactions_bookingId_idx" ON "financial_transactions"("bookingId");

-- CreateIndex
CREATE INDEX "financial_transactions_sourceType_sourceId_idx" ON "financial_transactions"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "tasks_tripId_idx" ON "tasks"("tripId");

-- CreateIndex
CREATE INDEX "tasks_status_dueDate_idx" ON "tasks"("status", "dueDate");

-- CreateIndex
CREATE INDEX "tasks_assignedTo_idx" ON "tasks"("assignedTo");

-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_idx" ON "activity_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "activity_logs_date_idx" ON "activity_logs"("date");

-- CreateIndex
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

-- CreateIndex
CREATE INDEX "communications_entityType_entityId_idx" ON "communications"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "communications_type_idx" ON "communications"("type");

-- CreateIndex
CREATE INDEX "vendors_type_idx" ON "vendors"("type");

-- CreateIndex
CREATE INDEX "vendor_payments_vendorId_idx" ON "vendor_payments"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_payments_tripId_idx" ON "vendor_payments"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNumber_key" ON "quotations"("quotationNumber");

-- CreateIndex
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

-- CreateIndex
CREATE INDEX "quotations_approvalStatus_idx" ON "quotations"("approvalStatus");

-- CreateIndex
CREATE INDEX "quotations_customerId_idx" ON "quotations"("customerId");

-- CreateIndex
CREATE INDEX "quotation_items_quotationId_idx" ON "quotation_items"("quotationId");

-- CreateIndex
CREATE INDEX "itineraries_tripId_idx" ON "itineraries"("tripId");

-- CreateIndex
CREATE INDEX "itineraries_quotationId_idx" ON "itineraries"("quotationId");

-- CreateIndex
CREATE INDEX "itineraries_status_idx" ON "itineraries"("status");

-- CreateIndex
CREATE INDEX "itinerary_days_itineraryId_idx" ON "itinerary_days"("itineraryId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_voucherNumber_key" ON "vouchers"("voucherNumber");

-- CreateIndex
CREATE INDEX "vouchers_tripId_idx" ON "vouchers"("tripId");

-- CreateIndex
CREATE INDEX "vouchers_vendorId_idx" ON "vouchers"("vendorId");

-- CreateIndex
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");

-- CreateIndex
CREATE INDEX "vouchers_type_idx" ON "vouchers"("type");

-- CreateIndex
CREATE INDEX "passengers_customerId_idx" ON "passengers"("customerId");

-- CreateIndex
CREATE INDEX "passengers_passportNumber_idx" ON "passengers"("passportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "numbering_sequences_docType_financialYear_key" ON "numbering_sequences"("docType", "financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");

-- CreateIndex
CREATE INDEX "invoices_financialYear_idx" ON "invoices"("financialYear");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "invoice_line_items"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNoteNumber_key" ON "credit_notes"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_financialYear_idx" ON "credit_notes"("financialYear");

-- CreateIndex
CREATE INDEX "credit_notes_customerId_idx" ON "credit_notes"("customerId");

-- CreateIndex
CREATE INDEX "credit_note_line_items_creditNoteId_idx" ON "credit_note_line_items"("creditNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_debitNoteNumber_key" ON "debit_notes"("debitNoteNumber");

-- CreateIndex
CREATE INDEX "debit_notes_invoiceId_idx" ON "debit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "debit_notes_financialYear_idx" ON "debit_notes"("financialYear");

-- CreateIndex
CREATE INDEX "debit_notes_customerId_idx" ON "debit_notes"("customerId");

-- CreateIndex
CREATE INDEX "debit_note_line_items_debitNoteId_idx" ON "debit_note_line_items"("debitNoteId");

-- CreateIndex
CREATE INDEX "trip_services_tripId_idx" ON "trip_services"("tripId");

-- CreateIndex
CREATE INDEX "trip_services_supplierId_idx" ON "trip_services"("supplierId");

-- CreateIndex
CREATE INDEX "trip_services_serviceDate_idx" ON "trip_services"("serviceDate");

-- CreateIndex
CREATE INDEX "trip_services_status_idx" ON "trip_services"("status");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_idempotencyKey_key" ON "outbox_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "outbox_events_status_scheduledFor_idx" ON "outbox_events"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "message_logs_tripId_idx" ON "message_logs"("tripId");

-- CreateIndex
CREATE INDEX "message_logs_customerId_idx" ON "message_logs"("customerId");

-- CreateIndex
CREATE INDEX "enquiries_customerId_idx" ON "enquiries"("customerId");

-- CreateIndex
CREATE INDEX "enquiries_status_idx" ON "enquiries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotes_quoteNumber_key" ON "sales_quotes"("quoteNumber");

-- CreateIndex
CREATE INDEX "sales_quotes_enquiryId_idx" ON "sales_quotes"("enquiryId");

-- CreateIndex
CREATE INDEX "sales_quotes_customerId_idx" ON "sales_quotes"("customerId");

-- CreateIndex
CREATE INDEX "sales_quotes_status_idx" ON "sales_quotes"("status");

-- CreateIndex
CREATE INDEX "sales_quote_items_salesQuoteId_idx" ON "sales_quote_items"("salesQuoteId");

-- CreateIndex
CREATE INDEX "sales_quote_items_supplierId_idx" ON "sales_quote_items"("supplierId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_entries" ADD CONSTRAINT "receivable_entries_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_line_items" ADD CONSTRAINT "debit_note_line_items_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "debit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_services" ADD CONSTRAINT "trip_services_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_services" ADD CONSTRAINT "trip_services_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_items" ADD CONSTRAINT "sales_quote_items_salesQuoteId_fkey" FOREIGN KEY ("salesQuoteId") REFERENCES "sales_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_items" ADD CONSTRAINT "sales_quote_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Dynamic customer ledger view (not declarable in schema.prisma) ──────────
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
  rcv."lastPaymentDate"                             AS "lastPaymentDate"
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
