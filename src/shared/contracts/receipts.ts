// Customer receipts and refunds, recorded per family party where there is one.
import { z } from 'zod';

const day = z.string().date('Use YYYY-MM-DD');
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));

export const ReceiptMode = z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'GATEWAY', 'OTHER']);
export type ReceiptMode = z.infer<typeof ReceiptMode>;
export const RECEIPT_MODE_LABEL: Record<ReceiptMode, string> = {
  CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer', CARD: 'Card', CHEQUE: 'Cheque', GATEWAY: 'Payment link', OTHER: 'Not recorded',
};
export const ReceiptKind = z.enum(['RECEIPT', 'REFUND']);
export type ReceiptKind = z.infer<typeof ReceiptKind>;

export const ReceiptInput = z.object({
  kind:       ReceiptKind.default('RECEIPT'),
  /** The family party this money belongs to; leave empty for a payment made for the whole tour. */
  contractId: z.string().trim().max(64).optional().nullable().transform(v => (v ? v : null)),
  tripId:     z.string().trim().max(64).optional().nullable().transform(v => (v ? v : null)),
  customerId: z.string().trim().max(64).optional().nullable().transform(v => (v ? v : null)),
  amount:     z.coerce.number({ invalid_type_error: 'Enter an amount' }).positive('Enter an amount more than zero').max(100_000_000),
  mode:       ReceiptMode,
  receivedAt: day,
  reference:  optionalText(80),
  notes:      optionalText(1000),
}).superRefine((v, ctx) => {
  if (!v.contractId && !v.tripId && !v.customerId) ctx.addIssue({ code: 'custom', path: ['contractId'], message: 'Say who this money is from: a booking, a trip or a customer' });
  if (v.mode === 'CHEQUE' && !v.reference) ctx.addIssue({ code: 'custom', path: ['reference'], message: 'Enter the cheque number' });
});
export type ReceiptInput = z.infer<typeof ReceiptInput>;

export const ReceiptCancel = z.object({ reason: z.string().trim().min(3, 'Say why it is being cancelled').max(300) });
export type ReceiptCancel = z.infer<typeof ReceiptCancel>;

export const ReceiptListQuery = z.object({
  contractId: z.string().trim().max(64).optional(),
  tripId:     z.string().trim().max(64).optional(),
  customerId: z.string().trim().max(64).optional(),
  kind:       ReceiptKind.optional(),
  mode:       ReceiptMode.optional(),
  from:       day.optional(),
  to:         day.optional(),
  includeCancelled: z.coerce.boolean().optional(),
  q:          z.string().trim().max(100).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(200).default(50),
});
export type ReceiptListQuery = z.infer<typeof ReceiptListQuery>;
