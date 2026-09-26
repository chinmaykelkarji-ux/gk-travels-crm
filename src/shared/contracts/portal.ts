// The customer portal — what the office sends and what the customer submits.
import { z } from 'zod';

export const PortalLinkCreate = z.object({
  customerId: z.string().trim().min(1).max(64),
  days: z.number().int().min(1).max(365).default(90),
  requireCode: z.boolean().default(false),
  codeChannel: z.enum(['WHATSAPP', 'EMAIL']).optional().nullable(),
  label: z.string().trim().max(120).optional().nullable().transform(v => (v ? v : null)),
});
export type PortalLinkCreate = z.infer<typeof PortalLinkCreate>;

export const PortalCode = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code') });

export const PortalFeedback = z.object({
  rating: z.number().int().min(1, 'Choose from 1 to 5 stars').max(5),
  comments: z.string().trim().max(2000).optional().nullable().transform(v => (v ? v : null)),
});
export type PortalFeedback = z.infer<typeof PortalFeedback>;
