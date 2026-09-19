// Tickets v2: ticket → segments → passenger rows (one per passenger per
// segment). Flight, train and bus; one PNR can carry a whole group.
import { z } from 'zod';
import { queryBool } from './common';
import { parseIst } from '../calc/istTime';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalId = optionalText(64);
const money = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100_000_000);
const optionalMoney = z.union([money, z.literal('').transform(() => null), z.null()]).optional().transform(v => (v === undefined ? null : v));
const optionalIst = z.string().trim().optional().nullable().or(z.literal('')).transform((v, ctx) => {
  if (!v) return null;
  const d = parseIst(v);
  if (!d) { ctx.addIssue({ code: 'custom', message: 'Use a date and time' }); return z.NEVER; }
  return d.toISOString();
});

export const TicketMode = z.enum(['FLIGHT', 'TRAIN', 'BUS']);
export type TicketMode = z.infer<typeof TicketMode>;
export const TicketStatus = z.enum(['REQUESTED', 'ON_HOLD', 'CONFIRMED', 'PARTIAL', 'WAITLISTED', 'RAC', 'CANCELLED']);
export type TicketStatus = z.infer<typeof TicketStatus>;
export const PassengerStatus = z.enum(['PENDING', 'CONFIRMED', 'WAITLISTED', 'RAC', 'CANCELLED']);
export type PassengerStatus = z.infer<typeof PassengerStatus>;
export const TrainQuota = z.enum(['GENERAL', 'TATKAL', 'PREMIUM_TATKAL', 'LADIES', 'SENIOR_CITIZEN', 'LOWER_BERTH', 'DIVYANG', 'OTHER']);
export const PaxType = z.enum(['ADULT', 'CHILD', 'INFANT', 'SENIOR']);

export const TRAIN_CLASSES = ['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC', '2S'] as const;
export const BERTHS = ['LB', 'MB', 'UB', 'SL', 'SU', 'WS', 'MS', 'AS'] as const;

export const SegmentInput = z.object({
  carrierNumber: optionalText(20),  // flight / train / bus number
  carrierName:   optionalText(80),  // airline, train name, bus operator
  fromCode:      optionalText(10),
  fromName:      z.string().trim().min(1, 'From is required').max(80),
  toCode:        optionalText(10),
  toName:        z.string().trim().min(1, 'To is required').max(80),
  departAt:      optionalIst,
  arriveAt:      optionalIst,
  travelClass:   optionalText(20),
  boardingPoint: optionalText(300),
  droppingPoint: optionalText(300),
  terminal:      optionalText(20),
  platform:      optionalText(20),
  baggage:       optionalText(60),
}).refine(s => !s.departAt || !s.arriveAt || s.arriveAt > s.departAt, { path: ['arriveAt'], message: 'Arrival must be after departure' });
export type SegmentInput = z.infer<typeof SegmentInput>;

export const PassengerInput = z.object({
  travellerId:  optionalId,
  name:         z.string().trim().max(120).optional(),
  paxType:      PaxType.default('ADULT'),
  age:          z.coerce.number().int().min(0).max(120).optional().nullable(),
  gender:       z.enum(['M', 'F', 'X']).optional().nullable(),
  boardingPoint: optionalText(300),
}).refine(p => !!p.travellerId || !!p.name, { path: ['name'], message: 'Choose a traveller or type a name' });
export type PassengerInput = z.infer<typeof PassengerInput>;

const fare = {
  baseFare:          money.default(0),
  taxes:             money.default(0),
  otherCharges:      money.default(0),
  serviceFee:        money.default(0),
  /** GST on our service fee. Default comes from settings (verify with CA). */
  serviceFeeGstPct:  z.coerce.number().min(0).max(28).optional().nullable(),
  costAmount:        money.default(0),
};

export const TicketInput = z.object({
  tripId:          optionalId,
  contractId:      optionalId,
  customerId:      optionalId,
  mode:            TicketMode,
  pnr:             optionalText(20),
  carrier:         optionalText(80),
  bookingRef:      optionalText(60),
  quota:           TrainQuota.optional().nullable(),
  travelClass:     optionalText(20),
  vendorId:        optionalId,
  sourceDocumentId: optionalId,
  customerNotes:   optionalText(1000),
  internalNotes:   optionalText(2000),
  segments:        z.array(SegmentInput).min(1, 'Add at least one segment').max(8),
  passengers:      z.array(PassengerInput).max(200).default([]),
  ...fare,
}).refine(t => !!t.tripId || !!t.customerId, { path: ['customerId'], message: 'Link the ticket to a trip or a customer' });
export type TicketInput = z.infer<typeof TicketInput>;

export const TicketUpdate = z.object({
  contractId:      optionalId,
  customerId:      optionalId,
  pnr:             optionalText(20),
  carrier:         optionalText(80),
  bookingRef:      optionalText(60),
  quota:           TrainQuota.optional().nullable(),
  travelClass:     optionalText(20),
  vendorId:        optionalId,
  sourceDocumentId: optionalId,
  customerNotes:   optionalText(1000),
  internalNotes:   optionalText(2000),
  status:          z.enum(['REQUESTED', 'ON_HOLD']).optional(),
  baseFare: money.optional(), taxes: money.optional(), otherCharges: money.optional(), serviceFee: money.optional(),
  serviceFeeGstPct: z.coerce.number().min(0).max(28).optional().nullable(), costAmount: money.optional(),
}).partial();
export type TicketUpdate = z.infer<typeof TicketUpdate>;

export const PassengerRowUpdate = z.object({
  status:        PassengerStatus.optional(),
  /** Raw status as IRCTC / the airline shows it; parsed into status, coach and berth when possible. */
  bookingStatus: optionalText(40),
  currentStatus: optionalText(40),
  coach:         optionalText(10),
  seat:          optionalText(10),
  berth:         optionalText(10),
  ticketNumber:  optionalText(30),
  boardingPoint: optionalText(300),
  fare:          optionalMoney,
}).partial();
export type PassengerRowUpdate = z.infer<typeof PassengerRowUpdate>;

/** Paste statuses after chart preparation: one line per passenger row. */
export const BulkStatusInput = z.object({
  rows: z.array(z.object({ rowId: z.string().min(1), currentStatus: z.string().trim().min(1).max(40) })).min(1).max(400),
  chartPrepared: z.boolean().default(false),
});
export type BulkStatusInput = z.infer<typeof BulkStatusInput>;

export const TicketCancel = z.object({
  reason: z.string().trim().min(3, 'Give a reason').max(300),
  /** Cancel only these passengers (paxIndex); all when omitted. */
  paxIndexes: z.array(z.number().int().min(0)).max(200).optional(),
});
export type TicketCancel = z.infer<typeof TicketCancel>;

export const TicketListQuery = z.object({
  q:          z.string().trim().max(80).optional(),
  mode:       TicketMode.optional(),
  status:     TicketStatus.optional(),
  tripId:     z.string().max(64).optional(),
  customerId: z.string().max(64).optional(),
  from:       z.string().date().optional(),
  to:         z.string().date().optional(),
  openOnly:   queryBool.default(false),
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(100).default(25),
});
export type TicketListQuery = z.infer<typeof TicketListQuery>;

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  REQUESTED: 'to book', ON_HOLD: 'on hold', CONFIRMED: 'confirmed', PARTIAL: 'part confirmed', WAITLISTED: 'waitlisted', RAC: 'RAC', CANCELLED: 'cancelled',
};
