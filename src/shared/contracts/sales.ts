// Sales pipeline v2 — leads and enquiries. Shared by the SPA forms and the API.
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalDate = z.string().date().optional().nullable().or(z.literal('')).transform(v => (v ? v : null));
const phone = z.string().trim().min(6, 'Phone number is too short').max(20).regex(/^[+\d\s\-()]+$/, 'Invalid phone number');
const money = z.coerce.number().min(0).max(1_000_000_000).optional().nullable();

// ── Leads ─────────────────────────────────────────────────────
// Lifecycle: new → contacted → qualified → converted; lost from any open state.

export const LeadStatus = z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']);
export type LeadStatus = z.infer<typeof LeadStatus>;
export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new:       ['contacted', 'qualified', 'lost'],
  contacted: ['qualified', 'new', 'lost'],
  qualified: ['contacted', 'lost'],
  converted: [],
  lost:      ['new'],
};
export const LeadSource = z.enum(['WhatsApp', 'Instagram', 'Facebook', 'Google', 'Website', 'Phone', 'Walk-in', 'Referral', 'Repeat', 'Corporate', 'Other']);
export const Priority = z.enum(['low', 'medium', 'high']);
export const TripType = z.enum(['Leisure', 'Honeymoon', 'Family', 'Group', 'Corporate', 'Pilgrimage', 'Adventure', 'Other']);

export const LeadCreate = z.object({
  name:         z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  phone,
  email:        z.string().trim().email('Invalid email').max(160).optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  source:       z.string().trim().min(1, 'Source is required').max(40),
  destination:  z.string().trim().max(120).default(''),
  travelDate:   optionalDate,
  pax:          z.coerce.number().int().min(1).max(500).default(1),
  budget:       money,
  tripType:     z.string().trim().max(40).default(''),
  priority:     Priority.default('medium'),
  notes:        z.string().trim().max(2000).default(''),
  followUpDate: optionalDate,
  assignedToUserId: optionalText(64),
  /** Create even if an open lead or a customer already has this phone. */
  force:        z.boolean().default(false),
});
export type LeadCreate = z.infer<typeof LeadCreate>;
export const LeadUpdate = LeadCreate.omit({ force: true }).partial();
export type LeadUpdate = z.infer<typeof LeadUpdate>;

export const LeadListQuery = z.object({
  q:        z.string().trim().max(120).optional(),
  status:   LeadStatus.optional(),
  assignedToUserId: z.string().max(64).optional(),
  source:   z.string().max(40).optional(),
  includeClosed: z.coerce.boolean().default(false),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type LeadListQuery = z.infer<typeof LeadListQuery>;

export const LeadStatusChange = z.object({
  status:     LeadStatus,
  lostReason: optionalText(300),
  note:       optionalText(1000),
}).superRefine((v, ctx) => {
  if (v.status === 'lost' && !v.lostReason) ctx.addIssue({ code: 'custom', path: ['lostReason'], message: 'Say why the lead was lost' });
});
export const AssignInput = z.object({ userId: z.string().max(64).nullable() });
export const NoteInput = z.object({ note: z.string().trim().min(1, 'Write something').max(2000) });

export const LeadConvert = z.object({
  /** Attach to an existing customer; otherwise one is found by phone or created. */
  customerId:  optionalText(64),
  destination: optionalText(120),
  departureDate: optionalDate,
  returnDate:  optionalDate,
  adults:      z.coerce.number().int().min(1).max(500).optional(),
  children:    z.coerce.number().int().min(0).max(500).default(0),
  infants:     z.coerce.number().int().min(0).max(100).default(0),
  budget:      money,
  requirements: optionalText(2000),
});
export type LeadConvert = z.infer<typeof LeadConvert>;

// ── Enquiries ─────────────────────────────────────────────────

export const EnquiryStatus = z.enum(['NEW', 'IN_PROGRESS', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST']);
export type EnquiryStatus = z.infer<typeof EnquiryStatus>;
export const ENQUIRY_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW:         ['IN_PROGRESS', 'LOST'],
  IN_PROGRESS: ['QUOTED', 'NEW', 'LOST'],
  QUOTED:      ['NEGOTIATING', 'WON', 'IN_PROGRESS', 'LOST'],
  NEGOTIATING: ['QUOTED', 'WON', 'LOST'],
  WON:         [],
  LOST:        ['NEW'],
};
export const EnquirySource = z.enum(['DIRECT', 'WHATSAPP', 'PHONE', 'EMAIL', 'REFERRAL', 'WEBSITE']);

const EnquiryFields = z.object({
  source:        EnquirySource.default('DIRECT'),
  destination:   z.string().trim().min(2, 'Destination is required').max(120),
  origin:        optionalText(80),
  departureDate: optionalDate,
  returnDate:    optionalDate,
  flexibleDates: z.boolean().default(false),
  adults:        z.coerce.number().int().min(1, 'At least one adult').max(500).default(1),
  children:      z.coerce.number().int().min(0).max(500).default(0),
  infants:       z.coerce.number().int().min(0).max(100).default(0),
  rooms:         z.coerce.number().int().min(1).max(200).optional().nullable(),
  tripType:      optionalText(40),
  hotelCategory: optionalText(40),
  mealPlan:      optionalText(20),
  budget:        money,
  budgetMax:     money,
  requirements:  optionalText(2000),
  preferences:   z.record(z.string().max(300)).default({}),
  priority:      Priority.default('medium'),
  assignedToUserId: optionalText(64),
  notes:         optionalText(2000),
}).superRefine((v, ctx) => {
  if (v.departureDate && v.returnDate && v.returnDate < v.departureDate) ctx.addIssue({ code: 'custom', path: ['returnDate'], message: 'Return must be after departure' });
  if (v.budget != null && v.budgetMax != null && v.budgetMax < v.budget) ctx.addIssue({ code: 'custom', path: ['budgetMax'], message: 'Max must be at least the min' });
});

export const EnquiryCreate = EnquiryFields.innerType().extend({
  customerId: optionalText(64),
  /** Inline customer creation when no customerId is given. */
  newCustomer: z.object({ name: z.string().trim().min(2).max(120), phone, email: z.string().trim().email().max(160).optional().nullable().or(z.literal('')).transform(v => (v ? v : null)) }).optional().nullable(),
  leadId:     optionalText(64),
}).superRefine((v, ctx) => {
  if (!v.customerId && !v.newCustomer) ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'Choose a customer or enter a new one' });
  if (v.departureDate && v.returnDate && v.returnDate < v.departureDate) ctx.addIssue({ code: 'custom', path: ['returnDate'], message: 'Return must be after departure' });
  if (v.budget != null && v.budgetMax != null && v.budgetMax < v.budget) ctx.addIssue({ code: 'custom', path: ['budgetMax'], message: 'Max must be at least the min' });
});
export type EnquiryCreate = z.infer<typeof EnquiryCreate>;
export const EnquiryUpdate = EnquiryFields.innerType().partial();
export type EnquiryUpdate = z.infer<typeof EnquiryUpdate>;

export const EnquiryListQuery = z.object({
  q:        z.string().trim().max(120).optional(),
  status:   EnquiryStatus.optional(),
  assignedToUserId: z.string().max(64).optional(),
  customerId: z.string().max(64).optional(),
  includeClosed: z.coerce.boolean().default(false),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type EnquiryListQuery = z.infer<typeof EnquiryListQuery>;

export const EnquiryStatusChange = z.object({
  status:     EnquiryStatus,
  lostReason: optionalText(300),
  note:       optionalText(1000),
}).superRefine((v, ctx) => {
  if (v.status === 'LOST' && !v.lostReason) ctx.addIssue({ code: 'custom', path: ['lostReason'], message: 'Say why the enquiry was lost' });
});

export const FollowUpInput = z.object({
  dueDate: z.string().date(),
  title:   z.string().trim().min(2).max(160).optional(),
  note:    optionalText(1000),
  assignedToUserId: optionalText(64),
});

export const paxTotal = (e: { adults: number; children: number; infants: number }) => e.adults + e.children + e.infants;
