// Driver view: the only things a DRIVER login can send.
import { z } from 'zod';

export const DriverStatusChange = z.object({
  status: z.enum(['ACKNOWLEDGED', 'STARTED', 'ARRIVED', 'ON_BOARD', 'COMPLETED', 'ISSUE']),
  note:   z.string().trim().max(500).optional().nullable().transform(v => (v ? v : null)),
}).superRefine((v, ctx) => {
  if (v.status === 'ISSUE' && !v.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Say what the problem is' });
});
export type DriverStatusChange = z.infer<typeof DriverStatusChange>;

export const DriverDutiesQuery = z.object({ range: z.enum(['current', 'past']).default('current') });
export type DriverDutiesQuery = z.infer<typeof DriverDutiesQuery>;

export const DriverLoginLink = z.object({ userId: z.string().trim().min(1).max(64).nullable() });
export type DriverLoginLink = z.infer<typeof DriverLoginLink>;
