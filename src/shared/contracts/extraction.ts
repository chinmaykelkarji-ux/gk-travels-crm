// ============================================================
// What TravelOS asks a document for, field by field.
//
// Every field is answered as `{ value, confidence }`:
//   - `value: null` means the document does not show it, or it could not be
//     read with confidence. The model is told to answer null rather than
//     guess, and the review screen says "unable to confidently identify"
//     (hard rule 8)
//   - `confidence` is the model's own reading of how sure it is; anything
//     below `high` is shown for a person to confirm before it is saved
//
// The same schemas validate the answer and generate the JSON schema the
// model must answer in (`calc/jsonSchema.ts`), so the question and the check
// can never drift apart.
// ============================================================

import { z } from 'zod';
import { DocumentType } from './documents.js';

export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

/** One answered field: what was read, and how sure the model is. */
export function field<T extends z.ZodTypeAny>(inner: T, description: string) {
  return z.object({
    value: inner.nullable().describe(description),
    confidence: Confidence.describe('high only when the document states it plainly; low when it had to be inferred'),
  });
}
export interface ExtractedField<T> { value: T | null; confidence: Confidence }

const text = (d: string) => field(z.string(), d);
const day = (d: string) => field(z.string(), `${d} — as YYYY-MM-DD`);
const time = (d: string) => field(z.string(), `${d} — 24-hour HH:MM in the local time of that place`);
const amount = (d: string) => field(z.number(), `${d} — in rupees, digits only`);
const count = (d: string) => field(z.number().int(), d);

// ── What kind of document is this ────────────────────────────

export const Classification = z.object({
  type: DocumentType.describe('The kind of document this is'),
  confidence: Confidence,
  reason: z.string().describe('One short line naming what in the document decided it'),
});
export type Classification = z.infer<typeof Classification>;

// ── Tickets (flight, train, bus) ─────────────────────────────

export const TravelMode = z.enum(['FLIGHT', 'TRAIN', 'BUS']);

export const TicketExtraction = z.object({
  mode: field(TravelMode, 'Flight, train or bus'),
  pnr: text('The PNR or booking reference'),
  airlineOrOperator: text('The airline, railway or bus operator name'),
  ticketNumber: text('The ticket number, if one is printed separately from the PNR'),
  travelClass: text('Class of travel, as printed (e.g. 3A, SL, Economy, Sleeper)'),
  quota: text('Only for Indian Railways: GENERAL, TATKAL, LADIES, SENIOR — null for anything else'),
  bookedOn: day('The date the ticket was booked'),
  fare: amount('The total fare paid for the whole ticket'),
  segments: z.array(z.object({
    fromName: text('Where this leg starts — station, airport or bus stand as printed'),
    fromCode: text('Its code, if printed (e.g. BLR, LTT)'),
    toName: text('Where this leg ends'),
    toCode: text('Its code, if printed'),
    departDate: day('Departure date of this leg'),
    departTime: time('Departure time of this leg'),
    arriveDate: day('Arrival date of this leg'),
    arriveTime: time('Arrival time of this leg'),
    serviceNumber: text('Flight number, train number and name, or bus service number'),
    travelClass: text('Class for this leg if it differs from the ticket'),
  })).describe('One entry per leg printed on the ticket, in the order they are travelled'),
  passengers: z.array(z.object({
    name: text('The passenger name exactly as printed'),
    age: count('Age, if printed'),
    gender: text('M, F or other, if printed'),
    seat: text('Seat or berth, if printed (e.g. B2 14, 12A)'),
    status: text('Booking status as printed (CNF, RAC, WL 12, confirmed)'),
  })).describe('Every passenger named on the ticket'),
});
export type TicketExtraction = z.infer<typeof TicketExtraction>;

// ── Hotel confirmation ───────────────────────────────────────

export const HotelExtraction = z.object({
  hotelName: text('The hotel name'),
  city: text('The city or town the hotel is in'),
  confirmationNo: text('The confirmation or booking number'),
  bookedThrough: text('The agency, DMC or portal the booking came through, if named'),
  checkIn: day('Check-in date'),
  checkOut: day('Check-out date'),
  nights: count('Number of nights'),
  rooms: count('Number of rooms'),
  roomType: text('Room type as printed'),
  mealPlan: text('Meal plan as printed (EP, CP, MAP, AP, breakfast included)'),
  guestNames: z.array(text('A guest name as printed')).describe('Guests named on the confirmation'),
  totalAmount: amount('Total amount payable for the stay'),
  amountPaid: amount('Amount already paid, if the document says so'),
  cancellationPolicy: text('The cancellation terms, in one or two lines as printed'),
});
export type HotelExtraction = z.infer<typeof HotelExtraction>;

// ── A supplier's bill ────────────────────────────────────────

export const SupplierBillExtraction = z.object({
  supplierName: text("The supplier's name, as it appears at the top of the bill"),
  supplierGstin: text("The supplier's GSTIN, if printed"),
  billNumber: text('The invoice or bill number'),
  billDate: day('The invoice date'),
  dueDate: day('The date payment is due, if stated'),
  description: text('What was supplied, in one line'),
  taxableAmount: amount('Amount before tax'),
  gstAmount: amount('Total GST charged (CGST + SGST, or IGST)'),
  totalAmount: amount('The total payable including tax'),
  tripHint: text('Any tour name, group name or trip reference printed on the bill'),
});
export type SupplierBillExtraction = z.infer<typeof SupplierBillExtraction>;

/** Which schema answers for which kind of document; the rest are kept, not read. */
export const EXTRACTION_SCHEMAS = {
  FLIGHT_TICKET: TicketExtraction,
  TRAIN_TICKET: TicketExtraction,
  BUS_TICKET: TicketExtraction,
  HOTEL_CONFIRMATION: HotelExtraction,
  SUPPLIER_INVOICE: SupplierBillExtraction,
} as const;

export type ExtractableType = keyof typeof EXTRACTION_SCHEMAS;
export const EXTRACTABLE_TYPES = Object.keys(EXTRACTION_SCHEMAS) as ExtractableType[];
export const isExtractable = (t: string): t is ExtractableType => (EXTRACTABLE_TYPES as string[]).includes(t);

/** What a proposal turns into once a person approves it. */
export const ProposalKind = z.enum(['TICKET', 'HOTEL_BOOKING', 'VENDOR_BILL']);
export type ProposalKind = z.infer<typeof ProposalKind>;

export const PROPOSAL_FOR: Record<ExtractableType, ProposalKind> = {
  FLIGHT_TICKET: 'TICKET', TRAIN_TICKET: 'TICKET', BUS_TICKET: 'TICKET',
  HOTEL_CONFIRMATION: 'HOTEL_BOOKING', SUPPLIER_INVOICE: 'VENDOR_BILL',
};

export const ExtractionStatus = z.enum(['QUEUED', 'READING', 'READY', 'APPLIED', 'REJECTED', 'FAILED']);
export type ExtractionStatus = z.infer<typeof ExtractionStatus>;

export const EXTRACTION_STATUS_LABEL: Record<ExtractionStatus, string> = {
  QUEUED: 'Waiting to be read', READING: 'Being read', READY: 'Ready for your check',
  APPLIED: 'Saved to the record', REJECTED: 'Set aside', FAILED: 'Could not be read',
};

/** The review decision a person makes, with any corrections they typed. */
export const ExtractionApproval = z.object({
  /** The values as the person confirmed them — the model's answer with their edits. */
  values: z.record(z.unknown()),
  /** What it should be attached to; a person can change the match. */
  tripId: z.string().trim().max(64).nullable().optional(),
  vendorId: z.string().trim().max(64).nullable().optional(),
  note: z.string().trim().max(500).optional(),
});
export type ExtractionApproval = z.infer<typeof ExtractionApproval>;

export const ExtractionReject = z.object({ reason: z.string().trim().min(1, 'Say why, in a few words').max(300) });
export type ExtractionReject = z.infer<typeof ExtractionReject>;
