// Trip operational records: hotel bookings, vehicle assignments, activity
// bookings. Shared by the trip workspace forms and the API.
import { z } from 'zod';
import { MealPlan } from './masters';
import { parseIst } from '../calc/istTime';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalId = optionalText(64);
const money = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100_000_000);
const day = z.string().date('Use YYYY-MM-DD');
/** IST wall-clock "YYYY-MM-DDTHH:mm" or an ISO instant; normalised to an ISO instant. */
const istDateTime = z.string().trim().min(10).transform((v, ctx) => {
  const d = parseIst(v);
  if (!d) { ctx.addIssue({ code: 'custom', message: 'Use a date and time' }); return z.NEVER; }
  return d.toISOString();
});
const count = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const OpsStatus = z.enum(['REQUESTED', 'ON_HOLD', 'CONFIRMED', 'CANCELLED']);
export type OpsStatus = z.infer<typeof OpsStatus>;
export const AssignmentStatus = z.enum(['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;
export const DriverDutyStatus = z.enum(['ASSIGNED', 'ACKNOWLEDGED', 'STARTED', 'ARRIVED', 'ON_BOARD', 'COMPLETED', 'ISSUE']);
export type DriverDutyStatus = z.infer<typeof DriverDutyStatus>;

// ── Hotel bookings ────────────────────────────────────────────
const hotelShape = z.object({
  contractId:     optionalId,
  hotelId:        optionalId,
  hotelName:      z.string().trim().max(160).optional(),
  city:           optionalText(80),
  roomTypeId:     optionalId,
  roomTypeName:   optionalText(80),
  mealPlan:       MealPlan.optional().nullable(),
  checkIn:        day,
  checkOut:       day,
  rooms:          count(1, 500).default(1),
  adults:         count(0, 2000).default(2),
  children:       count(0, 2000).default(0),
  travellerIds:   z.array(z.string().min(1)).max(500).default([]),
  vendorId:       optionalId,
  confirmationNo: optionalText(60),
  costAmount:     money.default(0),
  sellAmount:     money.default(0),
  customerNotes:  optionalText(1000),
  internalNotes:  optionalText(2000),
});
export const HotelBookingInput = hotelShape
  .refine(v => v.checkOut > v.checkIn, { path: ['checkOut'], message: 'Check-out must be after check-in' })
  .refine(v => !!v.hotelId || !!v.hotelName, { path: ['hotelName'], message: 'Choose a hotel or type its name' });
export type HotelBookingInput = z.infer<typeof HotelBookingInput>;
export const HotelBookingUpdate = hotelShape.partial();
export type HotelBookingUpdate = z.infer<typeof HotelBookingUpdate>;

// ── Vehicle assignments ───────────────────────────────────────
const vehicleShape = z.object({
  contractId:     optionalId,
  vehicleId:      optionalId,
  driverId:       optionalId,
  vendorId:       optionalId,
  vehicleType:    optionalText(40),
  seatsRequired:  count(1, 100).optional().nullable(),
  /** Vendor-supplied vehicle / driver not in the masters (cab owners often send these the day before). */
  vehicleRegNo:   optionalText(20),
  driverName:     optionalText(120),
  driverPhone:    optionalText(20),
  startAt:        istDateTime,
  endAt:          istDateTime,
  pickupPoint:    optionalText(300),
  dropPoint:      optionalText(300),
  route:          optionalText(1000),
  pax:            count(0, 500).default(0),
  confirmationNo: optionalText(60),
  costAmount:     money.default(0),
  sellAmount:     money.default(0),
  customerNotes:  optionalText(1000),
  internalNotes:  optionalText(2000),
});
export const VehicleAssignmentInput = vehicleShape
  .refine(v => v.endAt > v.startAt, { path: ['endAt'], message: 'End must be after start' })
  .refine(v => !!v.vehicleId || !!v.vehicleType, { path: ['vehicleType'], message: 'Choose a vehicle or the type needed' });
export type VehicleAssignmentInput = z.infer<typeof VehicleAssignmentInput>;
export const VehicleAssignmentUpdate = vehicleShape.partial();
export type VehicleAssignmentUpdate = z.infer<typeof VehicleAssignmentUpdate>;

export const ConflictQuery = z.object({
  vehicleId: z.string().max(64).optional(),
  driverId:  z.string().max(64).optional(),
  startAt:   istDateTime,
  endAt:     istDateTime,
  excludeId: z.string().max(64).optional(),
});

// ── Activity bookings ─────────────────────────────────────────
const activityShape = z.object({
  contractId:     optionalId,
  activityId:     optionalId,
  name:           z.string().trim().max(160).optional(),
  city:           optionalText(80),
  date:           day,
  time:           z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use HH:MM').optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  adults:         count(0, 2000).default(1),
  children:       count(0, 2000).default(0),
  vendorId:       optionalId,
  confirmationNo: optionalText(60),
  costAmount:     money.default(0),
  sellAmount:     money.default(0),
  customerNotes:  optionalText(1000),
  internalNotes:  optionalText(2000),
});
export const ActivityBookingInput = activityShape.refine(v => !!v.activityId || !!v.name, { path: ['name'], message: 'Choose an activity or type its name' });
export type ActivityBookingInput = z.infer<typeof ActivityBookingInput>;
export const ActivityBookingUpdate = activityShape.partial();
export type ActivityBookingUpdate = z.infer<typeof ActivityBookingUpdate>;

// ── Status changes ────────────────────────────────────────────
export const OpsStatusChange = z.object({
  status:         OpsStatus,
  confirmationNo: optionalText(60),
  reason:         optionalText(300),
});
export type OpsStatusChange = z.infer<typeof OpsStatusChange>;
export const AssignmentStatusChange = z.object({
  status:         AssignmentStatus,
  confirmationNo: optionalText(60),
  reason:         optionalText(300),
});
export type AssignmentStatusChange = z.infer<typeof AssignmentStatusChange>;

export const OPS_STATUS_LABEL: Record<OpsStatus, string> = { REQUESTED: 'requested', ON_HOLD: 'on hold', CONFIRMED: 'confirmed', CANCELLED: 'cancelled' };
export const DRIVER_STATUS_LABEL: Record<DriverDutyStatus, string> = {
  ASSIGNED: 'Assigned', ACKNOWLEDGED: 'Acknowledged', STARTED: 'On the way', ARRIVED: 'At pickup', ON_BOARD: 'Passengers on board', COMPLETED: 'Duty complete', ISSUE: 'Issue reported',
};
