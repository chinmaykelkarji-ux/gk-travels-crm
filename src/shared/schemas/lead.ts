import { z } from 'zod';

// Required fields per enterprise spec: full name, phone
// All other fields improve lead quality but are optional.

export const leadFormSchema = z.object({
  name: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Name is too long'),

  phone: z
    .string()
    .min(7, 'Phone number is required')
    .max(20, 'Phone too long')
    .regex(/^[+\d\s\-()]+$/, 'Invalid phone number format'),

  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),

  source: z
    .string()
    .min(1, 'Lead source is required'),

  destination: z.string().max(200).optional().default(''),

  travelDate: z.string().optional(),

  pax: z
    .number({ invalid_type_error: 'Enter a number' })
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(1),

  budget: z
    .number({ invalid_type_error: 'Enter a valid budget' })
    .min(0, 'Budget cannot be negative')
    .optional()
    .nullable(),

  tripType: z.string().optional().default(''),

  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),

  notes: z.string().max(2000).optional().default(''),

  assignedTo: z.string().optional().default(''),

  followUpDate: z.string().optional(),
});

export type LeadFormSchema = z.infer<typeof leadFormSchema>;

// Status update schema — stricter transitions enforced here
export const leadStatusSchema = z.object({
  status: z.enum([
    'new',
    'contacted',
    'follow_up',
    'quotation_sent',
    'confirmed',
    'converted',
    'cancelled',
  ]),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
});

export type LeadStatusSchema = z.infer<typeof leadStatusSchema>;
