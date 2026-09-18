// Customers v2 — request/response contracts shared by the SPA forms and the
// API (zod on both sides; the server strips unknown keys).
import { z } from 'zod';
import { queryBool } from './common';

export const CustomerType = z.enum(['INDIVIDUAL', 'CORPORATE']);
export const RelationshipKind = z.enum(['FAMILY', 'GROUP', 'COMPANY', 'FRIEND']);

const phone = z.string().trim().min(6, 'Phone number is too short').max(20).regex(/^[+\d\s\-()]+$/, 'Invalid phone number');
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));

export const CustomerCreate = z.object({
  name:           z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  phone,
  altPhone:       optionalText(20),
  email:          z.string().trim().email('Invalid email').max(160).optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  type:           CustomerType.default('INDIVIDUAL'),
  companyName:    optionalText(160),
  gstNumber:      optionalText(20),
  gstRegistered:  z.boolean().default(false),
  address:        optionalText(300),
  billingAddress: optionalText(300),
  city:           optionalText(80),
  state:          optionalText(80),
  source:         optionalText(60),
  referredByCustomerId: optionalText(64),
  passportNo:     optionalText(30),
  passportExpiry: z.string().date().optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  passportCountry: optionalText(60),
  panNumber:      optionalText(12),
  tags:           z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  preferences:    z.object({
    seatPreference:  z.string().max(40).optional(),
    mealPreference:  z.string().max(40).optional(),
    hotelPreference: z.string().max(80).optional(),
    notes:           z.string().max(500).optional(),
  }).partial().default({}),
  notes:          optionalText(2000),
  /** Create even when a customer with the same phone exists (e.g. family sharing one number). */
  force:          z.boolean().default(false),
});
export type CustomerCreate = z.infer<typeof CustomerCreate>;

export const CustomerUpdate = CustomerCreate.omit({ force: true }).partial();
export type CustomerUpdate = z.infer<typeof CustomerUpdate>;

export const CustomerListQuery = z.object({
  q:        z.string().trim().max(120).optional(),
  type:     CustomerType.optional(),
  tag:      z.string().max(30).optional(),
  sort:     z.enum(['name', 'recent', 'trips']).default('recent'),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  includeDeleted: queryBool.default(false),
});
export type CustomerListQuery = z.infer<typeof CustomerListQuery>;

export const RelationshipCreate = z.object({
  relatedCustomerId: z.string().min(1),
  kind:              RelationshipKind,
  note:              optionalText(200),
});
export type RelationshipCreate = z.infer<typeof RelationshipCreate>;

export const MergeInput = z.object({
  sourceId: z.string().min(1),
});

// ── Response shapes (what the SPA renders) ────────────────────

export interface CustomerSummary {
  id: string;
  customerNumber: number;
  name: string;
  phone: string;
  phoneNormalized: string | null;
  email: string | null;
  type: 'INDIVIDUAL' | 'CORPORATE';
  companyName: string | null;
  city: string | null;
  tags: string[];
  tripCount: number;
  lastTripAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}
