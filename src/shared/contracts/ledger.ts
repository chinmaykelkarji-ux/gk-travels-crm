// Ledger: journal entries, trial balance and account statements.
import { z } from 'zod';

const day = z.string().date('Use YYYY-MM-DD');
const money = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(1_000_000_000);
const optionalId = z.string().trim().max(64).optional().nullable().transform(v => (v ? v : null));

export const PostingLineInput = z.object({
  code:        z.string().trim().min(1, 'Choose an account').max(20),
  debit:       money.optional().nullable(),
  credit:      money.optional().nullable(),
  description: z.string().trim().max(300).optional().nullable().transform(v => (v ? v : null)),
  tripId:      optionalId,
  contractId:  optionalId,
  customerId:  optionalId,
  vendorId:    optionalId,
});
export type PostingLineInput = z.infer<typeof PostingLineInput>;

export const ManualEntry = z.object({
  date:       day,
  narration:  z.string().trim().min(3, 'Say what this entry is for').max(300),
  tripId:     optionalId,
  contractId: optionalId,
  customerId: optionalId,
  vendorId:   optionalId,
  lines:      z.array(PostingLineInput).min(2, 'A journal entry needs at least two lines').max(50),
});
export type ManualEntry = z.infer<typeof ManualEntry>;

export const ReverseEntry = z.object({ reason: z.string().trim().min(3, 'Say why it is being reversed').max(300) });
export type ReverseEntry = z.infer<typeof ReverseEntry>;

export const LedgerPeriodQuery = z.object({ from: day.optional(), to: day.optional() });
export type LedgerPeriodQuery = z.infer<typeof LedgerPeriodQuery>;

export const LedgerEntriesQuery = LedgerPeriodQuery.extend({
  code:       z.string().trim().max(20).optional(),
  tripId:     z.string().trim().max(64).optional(),
  contractId: z.string().trim().max(64).optional(),
  customerId: z.string().trim().max(64).optional(),
  vendorId:   z.string().trim().max(64).optional(),
  sourceType: z.string().trim().max(40).optional(),
  q:          z.string().trim().max(100).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(200).default(50),
});
export type LedgerEntriesQuery = z.infer<typeof LedgerEntriesQuery>;
