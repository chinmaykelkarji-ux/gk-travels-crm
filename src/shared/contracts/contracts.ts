// Booking contracts + payment schedules — contracts shared by the SPA and the API.
import { z } from 'zod';
import { queryBool } from './common';

export const ContractStatus = z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export type ContractStatus = z.infer<typeof ContractStatus>;
export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  CONFIRMED:   ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED:   [],
  CANCELLED:   [],
};

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));

export const ContractListQuery = z.object({
  q:          z.string().trim().max(120).optional(),
  status:     ContractStatus.optional(),
  customerId: z.string().max(64).optional(),
  salesQuoteId: z.string().max(64).optional(),
  includeClosed: queryBool.default(false),
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(100).default(25),
});
export type ContractListQuery = z.infer<typeof ContractListQuery>;

export const ScheduleItemInput = z.object({
  seq:     z.coerce.number().int().min(1).max(50),
  label:   z.string().trim().min(1).max(60),
  dueDate: z.string().date(),
  amount:  z.coerce.number().min(1).max(100_000_000),
});
export const ScheduleInput = z.object({ items: z.array(ScheduleItemInput).min(1).max(50) });
export type ScheduleInput = z.infer<typeof ScheduleInput>;

export const ContractStatusChange = z.object({
  status: ContractStatus,
  reason: optionalText(300),
}).superRefine((v, ctx) => {
  if (v.status === 'CANCELLED' && !v.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Say why the booking was cancelled' });
});

export const ContractNotes = z.object({ notes: optionalText(2000) });
