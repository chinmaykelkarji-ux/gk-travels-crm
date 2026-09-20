// Supplier bills and the payments that settle them.
import { z } from 'zod';

const day = z.string().date('Use YYYY-MM-DD');
const money = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0).max(100_000_000);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalId = z.string().trim().max(64).optional().nullable().transform(v => (v ? v : null));

/** What the money was spent on; it decides which expense account the bill lands in. */
export const BillCategory = z.enum(['HOTEL', 'TRANSPORT', 'TICKET', 'ACTIVITY', 'OTHER_TRIP', 'OFFICE']);
export type BillCategory = z.infer<typeof BillCategory>;
export const BILL_CATEGORY_LABEL: Record<BillCategory, string> = {
  HOTEL: 'Hotel', TRANSPORT: 'Transport', TICKET: 'Tickets', ACTIVITY: 'Activities', OTHER_TRIP: 'Other trip cost', OFFICE: 'Office cost',
};

export const PaymentMode = z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'GATEWAY', 'OTHER']);
export type PaymentMode = z.infer<typeof PaymentMode>;

export const VendorBillInput = z.object({
  vendorId:   z.string().trim().min(1, 'Choose the supplier').max(64),
  billNumber: z.string().trim().min(1, 'Enter the supplier\'s bill number').max(60),
  billDate:   day,
  dueDate:    day.optional().nullable(),
  category:   BillCategory,
  amount:     money.refine(v => v > 0, 'Enter the bill amount'),
  /** GST charged on the bill, if any; it is held separately as input credit — verify with CA. */
  gstAmount:  money.default(0),
  tripId:     optionalId,
  contractId: optionalId,
  description: optionalText(300),
  notes:      optionalText(1000),
}).superRefine((v, ctx) => {
  if (v.gstAmount > v.amount) ctx.addIssue({ code: 'custom', path: ['gstAmount'], message: 'GST cannot be more than the bill' });
  if (v.dueDate && v.dueDate < v.billDate) ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'The due date is before the bill date' });
});
export type VendorBillInput = z.infer<typeof VendorBillInput>;

export const VendorPaymentInput = z.object({
  vendorId: z.string().trim().min(1, 'Choose the supplier').max(64),
  /** The bill being settled; leave empty for an advance paid before the bill arrives. */
  billId:   optionalId,
  tripId:   optionalId,
  amount:   money.refine(v => v > 0, 'Enter an amount more than zero'),
  mode:     PaymentMode,
  paidAt:   day,
  reference: optionalText(80),
  notes:    optionalText(1000),
}).superRefine((v, ctx) => {
  if (v.mode === 'CHEQUE' && !v.reference) ctx.addIssue({ code: 'custom', path: ['reference'], message: 'Enter the cheque number' });
});
export type VendorPaymentInput = z.infer<typeof VendorPaymentInput>;

export const CancelInput = z.object({ reason: z.string().trim().min(3, 'Say why').max(300) });
export type CancelInput = z.infer<typeof CancelInput>;

export const PayablesQuery = z.object({
  vendorId: z.string().trim().max(64).optional(),
  tripId:   z.string().trim().max(64).optional(),
  category: BillCategory.optional(),
  status:   z.enum(['OPEN', 'PAID', 'CANCELLED', 'ALL']).default('OPEN'),
  from:     day.optional(),
  to:       day.optional(),
  q:        z.string().trim().max(100).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PayablesQuery = z.infer<typeof PayablesQuery>;
