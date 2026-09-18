// Unified quotation engine — contracts shared by the builder and the API.
import { z } from 'zod';
import { queryBool } from './common';

export const PricingBasis = z.enum(['PER_PERSON', 'PER_UNIT', 'PER_ROOM', 'PER_GROUP']);
export const Band = z.enum(['ADULT', 'CHILD', 'INFANT']);
export const GstModeZ = z.enum(['EXCLUDED', 'INCLUDED', 'NONE']);
export const ServiceTypeZ = z.enum(['FLIGHT', 'BUS', 'HOTEL', 'VEHICLE', 'ACTIVITY', 'TRANSFER', 'VISA', 'INSURANCE', 'OTHER']);
export const QuoteStatus = z.enum(['DRAFT', 'SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED']);
export type QuoteStatus = z.infer<typeof QuoteStatus>;

/** Status moves a user may request (accept/send/version have their own endpoints). */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT:       [],
  SENT:        ['VIEWED', 'NEGOTIATING', 'REJECTED', 'EXPIRED'],
  VIEWED:      ['NEGOTIATING', 'REJECTED', 'EXPIRED'],
  NEGOTIATING: ['REJECTED', 'EXPIRED'],
  ACCEPTED:    [],
  REJECTED:    [],
  EXPIRED:     [],
};
export const EDITABLE_STATUSES: QuoteStatus[] = ['DRAFT', 'NEGOTIATING'];

const money = z.coerce.number().min(0).max(100_000_000);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalDate = z.string().date().optional().nullable().or(z.literal('')).transform(v => (v ? v : null));

export const RateInput = z.object({
  band:      Band,
  count:     z.coerce.number().int().min(0).max(1000).default(0),
  costPrice: money.default(0),
  sellPrice: money.default(0),
});

export const ItemInput = z.object({
  /** Client-side key; the server assigns ids. Used to link option-group / party references. */
  key:           z.string().min(1).max(64),
  serviceType:   ServiceTypeZ.default('OTHER'),
  description:   z.string().trim().min(1, 'Describe the item').max(300),
  supplierId:    optionalText(64),
  pricingBasis:  PricingBasis.default('PER_UNIT'),
  costPrice:     money.default(0),
  sellPrice:     money.default(0),
  quantity:      z.coerce.number().int().min(0).max(10_000).default(1),
  nights:        z.coerce.number().int().min(1).max(365).optional().nullable(),
  serviceDate:   optionalDate,
  taxRate:       z.coerce.number().min(0).max(100).optional().nullable(),
  rates:         z.array(RateInput).max(3).default([]),
  optionGroupKey: optionalText(64),
  isSelectedOption: z.boolean().default(true),
  partyKey:      optionalText(64),
  customerNote:  optionalText(500),
  internalNote:  optionalText(500),
  details:       z.record(z.unknown()).default({}),
}).superRefine((v, ctx) => {
  if (v.pricingBasis === 'PER_PERSON' && !v.rates.some(r => r.count > 0)) ctx.addIssue({ code: 'custom', path: ['rates'], message: 'Per-person items need at least one band with a count' });
  const bands = v.rates.map(r => r.band);
  if (new Set(bands).size !== bands.length) ctx.addIssue({ code: 'custom', path: ['rates'], message: 'One rate per band' });
});
export type ItemInput = z.infer<typeof ItemInput>;

export const OptionGroupInput = z.object({ key: z.string().min(1).max(64), name: z.string().trim().min(1).max(80) });
export const PartyInput = z.object({
  key:      z.string().min(1).max(64),
  name:     z.string().trim().min(1).max(80),
  adults:   z.coerce.number().int().min(0).max(500).default(1),
  children: z.coerce.number().int().min(0).max(500).default(0),
  infants:  z.coerce.number().int().min(0).max(100).default(0),
  travellerIds: z.array(z.string().max(64)).max(200).default([]),
});

const QuoteFieldsBase = z.object({
  title:          optionalText(160),
  validUntil:     optionalDate,
  adults:         z.coerce.number().int().min(1).max(500).optional(),
  children:       z.coerce.number().int().min(0).max(500).optional(),
  infants:        z.coerce.number().int().min(0).max(100).optional(),
  gstMode:        GstModeZ.default('EXCLUDED'),
  gstRate:        z.coerce.number().min(0).max(100).default(5),
  discountAmount: money.default(0),
  notes:          optionalText(2000),
  termsConditions: optionalText(5000),
  inclusions:     optionalText(3000),
  exclusions:     optionalText(3000),
  paymentPolicy:  optionalText(2000),
  cancellationPolicy: optionalText(2000),
  items:          z.array(ItemInput).max(200).default([]),
  optionGroups:   z.array(OptionGroupInput).max(30).default([]),
  parties:        z.array(PartyInput).max(50).default([]),
});

type QuoteFieldsT = z.infer<typeof QuoteFieldsBase>;
function refineQuote(v: QuoteFieldsT, ctx: z.RefinementCtx) {
  const groupKeys = new Set(v.optionGroups.map(g => g.key)), partyKeys = new Set(v.parties.map(p => p.key));
  v.items.forEach((it, i) => {
    if (it.optionGroupKey && !groupKeys.has(it.optionGroupKey)) ctx.addIssue({ code: 'custom', path: ['items', i, 'optionGroupKey'], message: 'Unknown option group' });
    if (it.partyKey && !partyKeys.has(it.partyKey)) ctx.addIssue({ code: 'custom', path: ['items', i, 'partyKey'], message: 'Unknown party' });
  });
  for (const g of v.optionGroups) {
    const members = v.items.filter(it => it.optionGroupKey === g.key);
    if (members.length && members.filter(m => m.isSelectedOption).length !== 1) ctx.addIssue({ code: 'custom', path: ['optionGroups'], message: `Option group "${g.name}" must have exactly one selected item` });
  }
}

export const QuoteCreate = QuoteFieldsBase.extend({ enquiryId: z.string().min(1) }).superRefine(refineQuote);
export type QuoteCreate = z.infer<typeof QuoteCreate>;
export const QuoteUpdate = QuoteFieldsBase.superRefine(refineQuote);
export type QuoteUpdate = z.infer<typeof QuoteUpdate>;

export const QuoteListQuery = z.object({
  q:          z.string().trim().max(120).optional(),
  status:     QuoteStatus.optional(),
  enquiryId:  z.string().max(64).optional(),
  customerId: z.string().max(64).optional(),
  currentOnly: queryBool.default(true),
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(100).default(25),
});
export type QuoteListQuery = z.infer<typeof QuoteListQuery>;

export const QuoteStatusChange = z.object({ status: QuoteStatus, reason: optionalText(300) });
export const SelectOption = z.object({ optionGroupId: z.string().min(1), itemId: z.string().min(1) });
export const ApprovalDecision = z.object({ approve: z.boolean(), comment: optionalText(500) });
export const AcceptInput = z.object({
  /** Create one booking per party (family-wise split) instead of one for the whole group. */
  splitByParty: z.boolean().default(false),
  note: optionalText(500),
});
