-- Ticket Booking Mode: Convenience Fee is now a manually entered service
-- charge, with GST applied only on it. Add the GST breakdown columns for
-- the fee so it can be persisted alongside the existing convenienceFee.
ALTER TABLE "bookings" ADD COLUMN "taxableFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "gstOnFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
