// Itinerary v2: the builder in the trip workspace and its API.
import { z } from 'zod';
import { ITEM_KINDS, MAX_DAYS, MEALS } from '../calc/itinerary';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const clock = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour)');

export const ItineraryItemInput = z.object({
  id:              z.string().trim().max(40).optional().nullable(),
  time:            clock.optional().nullable().or(z.literal('').transform(() => null)),
  kind:            z.enum(ITEM_KINDS).default('NOTE'),
  title:           z.string().trim().min(1, 'Give the item a title').max(200),
  details:         optionalText(2000),
  internalNote:    optionalText(2000),
  internalCost:    z.coerce.number().min(0, 'Cannot be negative').max(100_000_000).optional().nullable(),
  customerVisible: z.boolean().default(true),
});
export type ItineraryItemInput = z.infer<typeof ItineraryItemInput>;

export const ItineraryDayInput = z.object({
  id:            z.string().trim().max(40).optional().nullable(),
  title:         z.string().trim().max(200).optional().nullable().transform(v => v || ''),
  morning:       optionalText(4000),
  afternoon:     optionalText(4000),
  evening:       optionalText(4000),
  hotelName:     optionalText(200),
  hotelAddress:  optionalText(500),
  meals:         z.array(z.enum(MEALS)).max(3).default([]),
  transfers:     optionalText(1000),
  notes:         optionalText(4000),
  internalNotes: optionalText(4000),
  items:         z.array(ItineraryItemInput).max(40, 'At most 40 items a day').default([]),
});
export type ItineraryDayInput = z.infer<typeof ItineraryDayInput>;

export const ItinerarySave = z.object({
  /** The revision the editor started from; a newer one on the server means someone else saved. */
  revision:         z.number().int().min(0),
  title:            z.string().trim().min(1, 'Give the itinerary a title').max(200),
  notes:            optionalText(8000),
  internalNotes:    optionalText(8000),
  emergencyContact: optionalText(500),
  days:             z.array(ItineraryDayInput).max(MAX_DAYS, `At most ${MAX_DAYS} days`),
});
export type ItinerarySave = z.infer<typeof ItinerarySave>;

export const ItineraryCreate = z.object({
  tripId:       z.string().trim().min(1).max(64),
  /** Start from another itinerary (a previous run of the same tour); its days are copied, bookings are not. */
  copyFromId:   z.string().trim().max(64).optional().nullable(),
  fromBookings: z.boolean().default(true),
});
export type ItineraryCreate = z.infer<typeof ItineraryCreate>;

export const ItineraryListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  limit:  z.coerce.number().int().min(1).max(50).default(20),
});
export type ItineraryListQuery = z.infer<typeof ItineraryListQuery>;
