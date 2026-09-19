// Trip control centre — contracts shared by the workspace and the API.
import { z } from 'zod';
import { queryBool } from './common';
import { parseIst } from '../calc/istTime';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalDate = z.string().date('Use YYYY-MM-DD').optional().nullable().or(z.literal('')).transform(v => (v ? v : null));
const optionalIst = z.string().trim().optional().nullable().or(z.literal('')).transform((v, ctx) => {
  if (!v) return null;
  const d = parseIst(v);
  if (!d) { ctx.addIssue({ code: 'custom', message: 'Use a date and time' }); return z.NEVER; }
  return d.toISOString();
});

export const TripStage = z.enum(['PLANNING', 'CONFIRMING', 'READY', 'ONGOING', 'COMPLETED', 'CANCELLED']);
export type TripStage = z.infer<typeof TripStage>;

export const TripListQuery = z.object({
  q:        z.string().trim().max(120).optional(),
  stage:    TripStage.optional(),
  /** Hide completed and cancelled trips unless asked. */
  includeClosed: queryBool.default(false),
  from:     z.string().date().optional(),
  to:       z.string().date().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type TripListQuery = z.infer<typeof TripListQuery>;

const tripShape = z.object({
  tourName:          optionalText(120),
  destination:       z.string().trim().min(2, 'Destination is required').max(160),
  departure:         optionalDate,
  returnDate:        optionalDate,
  customerId:        optionalText(64),
  isInternational:   z.boolean().default(false),
  assignedOpsUserId: optionalText(64),
  notes:             z.string().trim().max(4000).optional(),
});
export const TripCreate = tripShape.refine(v => !v.departure || !v.returnDate || v.returnDate >= v.departure, { path: ['returnDate'], message: 'Return must not be before departure' });
export type TripCreate = z.infer<typeof TripCreate>;
export const TripUpdate = tripShape.partial();
export type TripUpdate = z.infer<typeof TripUpdate>;

export const StageChange = z.object({
  stage:  TripStage,
  reason: optionalText(300),
});
export type StageChange = z.infer<typeof StageChange>;

export const PickupPointInput = z.object({
  id:           optionalText(64),
  name:         z.string().trim().min(2, 'Name the pickup point').max(120),
  address:      optionalText(300),
  landmark:     optionalText(160),
  pickupAt:     optionalIst,
  contactName:  optionalText(120),
  contactPhone: optionalText(20),
  mapUrl:       z.string().trim().url('Paste a full map link').max(500).optional().nullable().or(z.literal('')).transform(v => (v ? v : null)),
  notes:        optionalText(500),
});
export type PickupPointInput = z.infer<typeof PickupPointInput>;
export const PickupPointsPut = z.object({ points: z.array(PickupPointInput).max(40) });
export type PickupPointsPut = z.infer<typeof PickupPointsPut>;

export const TravellerAssignments = z.object({
  rows: z.array(z.object({
    travellerId:   z.string().min(1),
    contractId:    z.string().min(1).nullable().optional(),
    pickupPointId: z.string().min(1).nullable().optional(),
  })).min(1).max(500),
});
export type TravellerAssignments = z.infer<typeof TravellerAssignments>;
