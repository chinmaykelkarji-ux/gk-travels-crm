import { z } from 'zod';

// Required fields enforced per enterprise spec:
//   - customer name, phone, destination, departure date, pax
// Confirmed status blocked unless price is also present (handled in store action).

export const tripFormSchema = z.object({
  customer: z
    .string()
    .min(2, 'Customer name must be at least 2 characters')
    .max(100, 'Customer name is too long'),

  phone: z
    .string()
    .min(7, 'Phone number is required')
    .max(20, 'Phone number is too long')
    .regex(/^[+\d\s\-()]+$/, 'Invalid phone number format'),

  destination: z
    .string()
    .min(2, 'Destination is required')
    .max(200, 'Destination is too long'),

  pax: z
    .number({ invalid_type_error: 'Number of pax is required' })
    .int('Pax must be a whole number')
    .min(1, 'At least 1 pax required')
    .max(500, 'Pax count seems too high'),

  departure: z
    .string()
    .min(1, 'Departure date is required'),

  returnDate: z.string().optional(),

  type: z.string().min(1, 'Trip type is required'),

  totalAmount: z
    .number({ invalid_type_error: 'Please enter a valid amount' })
    .min(0, 'Amount cannot be negative')
    .optional()
    .nullable(),

  gstRate: z
    .number()
    .min(0, 'GST rate cannot be negative')
    .max(100, 'GST rate cannot exceed 100%')
    .optional()
    .default(5),

  gstMode: z
    .enum(['INCLUDED', 'EXCLUDED'])
    .optional()
    .default('EXCLUDED'),

  notes: z.string().max(2000, 'Notes too long').optional().default(''),
});

export type TripFormSchema = z.infer<typeof tripFormSchema>;

// Partial schema for editing (all fields optional)
export const tripEditSchema = tripFormSchema.partial().extend({
  // Status transitions have additional rules enforced at the store level.
  status: z
    .enum(['draft', 'quotation', 'confirmed', 'in_progress', 'completed', 'cancelled'])
    .optional(),
});

export type TripEditSchema = z.infer<typeof tripEditSchema>;

// Guard: trip can only be moved to "confirmed" if it has price + dates + pax
export function canConfirmTrip(trip: {
  totalAmount: number | null;
  departure:   string | null;
  pax:         number;
}): { ok: boolean; reason?: string } {
  if (!trip.totalAmount || trip.totalAmount <= 0) {
    return { ok: false, reason: 'Selling price must be set before confirming' };
  }
  if (!trip.departure) {
    return { ok: false, reason: 'Departure date is required before confirming' };
  }
  if (!trip.pax || trip.pax < 1) {
    return { ok: false, reason: 'Pax count must be set before confirming' };
  }
  return { ok: true };
}
