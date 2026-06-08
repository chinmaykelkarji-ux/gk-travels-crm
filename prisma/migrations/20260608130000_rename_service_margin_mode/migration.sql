-- "Ticket Booking Mode" is generalized into "Service Margin Mode": the same
-- GST-only-on-fee logic now also applies to hotel, cab, transfer and
-- vendor-arranged service bookings, not just airline/rail/bus tickets.
-- Renaming the column preserves all existing booking data.
ALTER TABLE "bookings" RENAME COLUMN "ticketBookingMode" TO "serviceMarginMode";
