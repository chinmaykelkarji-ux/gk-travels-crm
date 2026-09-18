// Travellers v2 — contracts shared by the SPA and the API.
import { z } from 'zod';

export const TravellerRole = z.enum(['LEAD', 'ADULT', 'CHILD', 'INFANT']);
export type TravellerRole = z.infer<typeof TravellerRole>;

/** Aadhaar is deliberately not accepted: UIDAI rules restrict its retention. */
export const GovtIdType = z.enum(['PAN', 'VOTER_ID', 'DRIVING_LICENCE', 'PASSPORT', 'OTHER']);

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalDate = z.string().date().optional().nullable().or(z.literal('')).transform(v => (v ? v : null));

export const TravellerCreate = z.object({
  customerId:            optionalText(64),
  title:                 z.enum(['Mr', 'Mrs', 'Ms', 'Miss', 'Master', 'Dr']).optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  firstName:             z.string().trim().min(1, 'First name is required').max(80),
  lastName:              z.string().trim().max(80).default(''),
  displayName:           optionalText(160),
  dateOfBirth:           optionalDate,
  gender:                z.enum(['M', 'F', 'X']).optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  nationality:           optionalText(60),
  relationToCustomer:    optionalText(40),
  phone:                 optionalText(20),
  email:                 z.string().trim().email('Invalid email').max(160).optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  passportNumber:        optionalText(20),
  passportIssueDate:     optionalDate,
  passportExpiry:        optionalDate,
  placeOfIssue:          optionalText(80),
  govtIdType:            GovtIdType.optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  govtIdNumber:          optionalText(30),
  visaStatus:            optionalText(30),
  visaExpiry:            optionalDate,
  visaCountry:           optionalText(60),
  visaType:              optionalText(40),
  frequentFlyerNumber:   optionalText(40),
  mealPreference:        optionalText(40),
  seatPreference:        optionalText(40),
  emergencyContactName:  optionalText(80),
  emergencyContactPhone: optionalText(20),
  emergencyRelation:     optionalText(40),
  notes:                 optionalText(2000),
  /** Create even if another traveller has the same passport number. */
  force:                 z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.passportExpiry && v.passportIssueDate && v.passportExpiry <= v.passportIssueDate) {
    ctx.addIssue({ code: 'custom', path: ['passportExpiry'], message: 'Expiry must be after the issue date' });
  }
  if (v.dateOfBirth && v.dateOfBirth > new Date().toISOString().slice(0, 10)) {
    ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Date of birth cannot be in the future' });
  }
  if (v.govtIdType && !v.govtIdNumber) {
    ctx.addIssue({ code: 'custom', path: ['govtIdNumber'], message: 'Enter the ID number' });
  }
});
export type TravellerCreate = z.infer<typeof TravellerCreate>;

export const TravellerUpdate = TravellerCreate.innerType().omit({ force: true }).partial();
export type TravellerUpdate = z.infer<typeof TravellerUpdate>;

export const TravellerListQuery = z.object({
  q:          z.string().trim().max(120).optional(),
  customerId: z.string().max(64).optional(),
  passport:   z.enum(['EXPIRED', 'EXPIRING', 'MISSING']).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(100).default(25),
});
export type TravellerListQuery = z.infer<typeof TravellerListQuery>;

export const TripTravellersPut = z.object({
  travellers: z.array(z.object({ travellerId: z.string().min(1), role: TravellerRole.default('ADULT') })).max(200),
  /** Keep trip.pax in step with the list (default true). */
  syncPax: z.boolean().default(true),
});
export type TripTravellersPut = z.infer<typeof TripTravellersPut>;

export const PassportAlertsQuery = z.object({
  days: z.coerce.number().int().min(1).max(730).default(180),
});

export interface TravellerSummary {
  id: string;
  customerId: string | null;
  customerName: string | null;
  title: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  passportStatus: 'OK' | 'EXPIRING' | 'INSUFFICIENT' | 'EXPIRED' | 'UNKNOWN';
  tripCount: number;
  createdAt: string;
}
