// Operations masters: vendors, hotels (room types, rates), vehicles, drivers,
// activities. Shared by the SPA forms, the API and the CSV import.
import { z } from 'zod';
import { queryBool } from './common';
import { IMPORT_KINDS } from '../calc/importMapping';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalDate = z.string().date('Use YYYY-MM-DD').optional().nullable().or(z.literal('')).transform(v => (v ? v : null));
const money = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100_000_000);
const optionalMoney = z.union([money, z.literal('').transform(() => null), z.null()]).optional().transform(v => (v === undefined ? null : v));
const optionalInt = (min: number, max: number) => z.union([z.coerce.number().int().min(min).max(max), z.literal('').transform(() => null), z.null()]).optional().transform(v => (v === undefined ? null : v));
const phone = z.string().trim().min(6, 'Phone number is too short').max(20).regex(/^[+\d\s\-()]+$/, 'Invalid phone number');
const email = z.string().trim().email('Invalid email').max(160).optional().nullable().or(z.literal('')).transform(v => (v ? v : null));
const gstin = z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5').optional().nullable().or(z.literal('')).transform(v => (v ? v : null));
const hhmm = z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use HH:MM').optional().nullable().or(z.literal('')).transform(v => (v ? v : null));

export const MasterListQuery = z.object({
  q:        z.string().trim().max(120).optional(),
  city:     z.string().trim().max(80).optional(),
  kind:     z.string().trim().max(40).optional(),
  vendorId: z.string().trim().max(64).optional(),
  includeInactive: queryBool.default(false),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type MasterListQuery = z.infer<typeof MasterListQuery>;

export const ActiveToggle = z.object({ isActive: z.boolean() });

// ── Vendors ───────────────────────────────────────────────────
export const VendorKind = z.enum(['DMC', 'AIR_CONSOLIDATOR', 'HOTEL', 'TRANSPORT', 'ACTIVITY', 'GUIDE', 'VISA', 'INSURANCE', 'RAIL_BUS_AGENT', 'OTHER']);
export type VendorKind = z.infer<typeof VendorKind>;
export const VENDOR_KIND_LABEL: Record<VendorKind, string> = {
  DMC: 'DMC', AIR_CONSOLIDATOR: 'Air consolidator', HOTEL: 'Hotel', TRANSPORT: 'Transport / cab owner', ACTIVITY: 'Activity provider',
  GUIDE: 'Guide', VISA: 'Visa agent', INSURANCE: 'Insurance', RAIL_BUS_AGENT: 'Rail / bus agent', OTHER: 'Other',
};

/** Legacy `vendors.type` strings ↔ kinds (the classic Suppliers screen still writes `type`). */
export function kindFromLegacyType(type: string | null | undefined): VendorKind {
  const t = (type ?? '').toLowerCase().trim();
  const map: Record<string, VendorKind> = { hotel: 'HOTEL', transport: 'TRANSPORT', cab: 'TRANSPORT', activity: 'ACTIVITY', guide: 'GUIDE', visa: 'VISA', dmc: 'DMC', insurance: 'INSURANCE', airline: 'AIR_CONSOLIDATOR', flight: 'AIR_CONSOLIDATOR', air: 'AIR_CONSOLIDATOR' };
  if (map[t]) return map[t];
  const upper = t.toUpperCase().replace(/[\s-]+/g, '_');
  return (VendorKind.options as string[]).includes(upper) ? (upper as VendorKind) : 'OTHER';
}
export function legacyTypeFromKind(kind: VendorKind): string {
  return ({ HOTEL: 'hotel', TRANSPORT: 'transport', ACTIVITY: 'activity', GUIDE: 'guide', VISA: 'visa' } as Partial<Record<VendorKind, string>>)[kind] ?? 'miscellaneous';
}

export const BankDetails = z.object({
  accountHolder: optionalText(120), accountNo: optionalText(30), ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC looks wrong').optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  bankName: optionalText(80), branch: optionalText(80), upiId: optionalText(80),
}).partial();

export const VendorInput = z.object({
  name:          z.string().trim().min(2, 'Name is required').max(160),
  kind:          z.preprocess(v => (typeof v === 'string' ? kindFromLegacyType(v) : v), VendorKind).default('OTHER'),
  companyName:   optionalText(160),
  contactPerson: optionalText(120),
  phone,
  whatsapp:      optionalText(20),
  email,
  city:          optionalText(80),
  state:         optionalText(80),
  address:       optionalText(300),
  gstNumber:     gstin,
  pan:           z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN must look like ABCDE1234F').optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  destinations:  z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  paymentTerms:  optionalText(200),
  creditDays:    optionalInt(0, 365),
  /** Accepted only from roles that may see bank details (finance). */
  bankDetails:   BankDetails.optional(),
  notes:         optionalText(2000),
  isActive:      z.boolean().default(true),
  /** Create even if another vendor has the same phone or GSTIN. */
  force:         z.boolean().default(false),
});
export type VendorInput = z.infer<typeof VendorInput>;
export const VendorUpdate = VendorInput.omit({ force: true }).partial();
export type VendorUpdate = z.infer<typeof VendorUpdate>;

// ── Hotels ────────────────────────────────────────────────────
export const MealPlan = z.enum(['EP', 'CP', 'MAP', 'AP', 'AI']);
export type MealPlan = z.infer<typeof MealPlan>;
export const MEAL_PLAN_LABEL: Record<MealPlan, string> = {
  EP: 'EP — room only', CP: 'CP — breakfast', MAP: 'MAP — breakfast + one meal', AP: 'AP — all meals', AI: 'All inclusive',
};

export const HotelInput = z.object({
  name:         z.string().trim().min(2, 'Hotel name is required').max(160),
  city:         z.string().trim().min(2, 'City is required').max(80),
  state:        optionalText(80),
  category:     optionalText(30),
  vendorId:     optionalText(64),
  address:      optionalText(300),
  phone:        optionalText(20),
  email,
  gstin,
  checkInTime:  hhmm,
  checkOutTime: hhmm,
  amenities:    z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  notes:        optionalText(2000),
  isActive:     z.boolean().default(true),
});
export type HotelInput = z.infer<typeof HotelInput>;
export const HotelUpdate = HotelInput.partial();
export type HotelUpdate = z.infer<typeof HotelUpdate>;

export const RoomTypeInput = z.object({
  name:        z.string().trim().min(1, 'Room type is required').max(80),
  maxAdults:   z.coerce.number().int().min(1).max(20).default(2),
  maxChildren: z.coerce.number().int().min(0).max(20).default(1),
  mealPlans:   z.array(MealPlan).min(1).max(5).default(['CP']),
  notes:       optionalText(500),
  isActive:    z.boolean().default(true),
});
export type RoomTypeInput = z.infer<typeof RoomTypeInput>;
export const RoomTypeUpdate = RoomTypeInput.partial();

const rateShape = z.object({
  mealPlan:     MealPlan,
  validFrom:    z.string().date('Use YYYY-MM-DD'),
  validTo:      z.string().date('Use YYYY-MM-DD'),
  costPerNight: money,
  sellPerNight: optionalMoney,
  extraAdult:   optionalMoney,
  extraChild:   optionalMoney,
  /** GST slab on this tariff; configurable because slabs change — verify with CA. */
  gstRatePct:   z.union([z.coerce.number().min(0).max(28), z.literal('').transform(() => null), z.null()]).optional().transform(v => (v === undefined ? null : v)),
  label:        optionalText(60),
});
export const RateInput = rateShape.refine(v => v.validTo >= v.validFrom, { path: ['validTo'], message: 'Valid-to must not be before valid-from' });
export type RateInput = z.infer<typeof RateInput>;

export const StayQuoteQuery = z.object({
  roomTypeId: z.string().min(1),
  mealPlan:   MealPlan,
  checkIn:    z.string().date(),
  checkOut:   z.string().date(),
  rooms:      z.coerce.number().int().min(1).max(200).default(1),
});

// ── Vehicles ──────────────────────────────────────────────────
export const VehicleOwnership = z.enum(['OWNED', 'VENDOR']);
export const VEHICLE_TYPES = ['Sedan', 'SUV', 'Innova Crysta', 'Tempo Traveller 12', 'Tempo Traveller 17', 'Tempo Traveller 26', 'Urbania', 'Mini bus 30', 'Bus 35', 'Bus 45', 'Bus 49', 'Sleeper bus'] as const;

export const VehicleInput = z.object({
  registrationNo:  z.string().trim().min(4, 'Registration number is required').max(20).transform(v => v.toUpperCase().replace(/[\s-]+/g, ' ').trim()),
  type:            z.string().trim().min(2, 'Vehicle type is required').max(40),
  make:            optionalText(40),
  model:           optionalText(40),
  seats:           z.coerce.number().int().min(1).max(100).default(4),
  ownership:       z.preprocess(v => (typeof v === 'string' ? v.toUpperCase() : v), VehicleOwnership).default('OWNED'),
  vendorId:        optionalText(64),
  defaultDriverId: optionalText(64),
  insuranceExpiry: optionalDate,
  permitExpiry:    optionalDate,
  fitnessExpiry:   optionalDate,
  pucExpiry:       optionalDate,
  notes:           optionalText(1000),
  isActive:        z.boolean().default(true),
}).refine(v => v.ownership !== 'VENDOR' || !!v.vendorId, { path: ['vendorId'], message: 'Choose the vendor who owns this vehicle' });
export type VehicleInput = z.infer<typeof VehicleInput>;
export const VehicleUpdate = VehicleInput.innerType().partial();
export type VehicleUpdate = z.infer<typeof VehicleUpdate>;

// ── Drivers ───────────────────────────────────────────────────
export const DriverInput = z.object({
  name:          z.string().trim().min(2, 'Name is required').max(120),
  phone,
  altPhone:      optionalText(20),
  vendorId:      optionalText(64),
  licenceNo:     optionalText(30),
  licenceExpiry: optionalDate,
  languages:     z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  address:       optionalText(300),
  emergencyContact: optionalText(120),
  notes:         optionalText(1000),
  isActive:      z.boolean().default(true),
  force:         z.boolean().default(false),
});
export type DriverInput = z.infer<typeof DriverInput>;
export const DriverUpdate = DriverInput.omit({ force: true }).partial();
export type DriverUpdate = z.infer<typeof DriverUpdate>;

// ── Activities ────────────────────────────────────────────────
export const ActivityInput = z.object({
  name:            z.string().trim().min(2, 'Activity name is required').max(160),
  city:            z.string().trim().min(2, 'City is required').max(80),
  category:        optionalText(40),
  vendorId:        optionalText(64),
  durationMinutes: optionalInt(0, 10_000),
  description:     optionalText(2000),
  inclusions:      optionalText(1000),
  costAdult:       optionalMoney,
  costChild:       optionalMoney,
  sellAdult:       optionalMoney,
  sellChild:       optionalMoney,
  minPax:          optionalInt(1, 500),
  maxPax:          optionalInt(1, 500),
  notes:           optionalText(1000),
  isActive:        z.boolean().default(true),
}).refine(v => v.minPax === null || v.maxPax === null || v.maxPax >= v.minPax, { path: ['maxPax'], message: 'Max pax must be at least min pax' });
export type ActivityInput = z.infer<typeof ActivityInput>;
export const ActivityUpdate = ActivityInput.innerType().partial();
export type ActivityUpdate = z.infer<typeof ActivityUpdate>;

// ── Import ────────────────────────────────────────────────────
export const ImportKindSchema = z.enum(IMPORT_KINDS as [string, ...string[]]);
export const CsvImport = z.object({
  csv: z.string().min(1, 'The file is empty').max(2_000_000, 'File is too large (2 MB of text max)'),
  /** Commit the valid rows even when some rows have errors (they are skipped and reported). */
  skipInvalid: z.boolean().default(false),
});
export type CsvImport = z.infer<typeof CsvImport>;

export type ImportRowStatus = 'create' | 'update' | 'error' | 'skip';
export interface ImportRowResult { line: number; status: ImportRowStatus; label: string; errors: Record<string, string>; matchId: string | null; data: Record<string, unknown> }
export interface ImportPreview {
  kind: string; totalRows: number; unknownHeaders: string[]; missingColumns: string[];
  counts: Record<ImportRowStatus, number>; rows: ImportRowResult[]; fileErrors: string[];
}
export const IMPORT_MAX_ROWS = 2000;

/** Days before a document expiry counts as "expiring" on the vehicle/driver compliance list. */
export const COMPLIANCE_WARN_DAYS = 30;
