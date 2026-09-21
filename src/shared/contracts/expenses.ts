// Money spent directly — fuel, tolls, food on the road, tips, office costs —
// as opposed to a supplier bill that arrives and is paid later.
import { z } from 'zod';

const day = z.string().date('Use YYYY-MM-DD');
const money = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0).max(10_000_000);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const optionalId = z.string().trim().max(64).optional().nullable().transform(v => (v ? v : null));

export const ExpenseCategory = z.enum(['TRIP_TRANSPORT', 'TRIP_FOOD', 'TRIP_OTHER', 'SALARY', 'RENT', 'OFFICE', 'BANK_CHARGES', 'MARKETING']);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  TRIP_TRANSPORT: 'Fuel, tolls, parking', TRIP_FOOD: 'Food and stay on the road', TRIP_OTHER: 'Other trip spending',
  SALARY: 'Salary and wages', RENT: 'Rent', OFFICE: 'Office and admin', BANK_CHARGES: 'Bank and gateway charges', MARKETING: 'Marketing',
};
/** Which expense account each category posts to (codes from calc/ledger.ts). */
export const EXPENSE_CATEGORY_ACCOUNT: Record<ExpenseCategory, string> = {
  TRIP_TRANSPORT: '5010', TRIP_FOOD: '5040', TRIP_OTHER: '5040',
  SALARY: '6000', RENT: '6010', OFFICE: '6020', BANK_CHARGES: '6030', MARKETING: '6040',
};

/** Where the money came from. STAFF means someone paid from their own pocket and is owed it back. */
export const PaidBy = z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'STAFF']);
export type PaidBy = z.infer<typeof PaidBy>;
export const PAID_BY_LABEL: Record<PaidBy, string> = {
  CASH: 'Office cash', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer', CARD: 'Card', STAFF: 'Staff paid, to be reimbursed',
};

export const ExpenseInput = z.object({
  date:        day,
  category:    ExpenseCategory,
  amount:      money.refine(v => v > 0, 'Enter an amount more than zero'),
  gstAmount:   money.default(0),
  paidBy:      PaidBy,
  /** Who spent it, when it was paid from someone's own pocket. */
  paidByUserId: optionalId,
  tripId:      optionalId,
  contractId:  optionalId,
  vendorId:    optionalId,
  description: z.string().trim().min(2, 'Say what it was for').max(200),
  notes:       optionalText(1000),
  documentId:  optionalId,
}).superRefine((v, ctx) => {
  if (v.gstAmount > v.amount) ctx.addIssue({ code: 'custom', path: ['gstAmount'], message: 'GST cannot be more than the amount' });
  if (v.paidBy === 'STAFF' && !v.paidByUserId) ctx.addIssue({ code: 'custom', path: ['paidByUserId'], message: 'Say who paid' });
});
export type ExpenseInput = z.infer<typeof ExpenseInput>;

export const ExpenseCancel = z.object({ reason: z.string().trim().min(3, 'Say why').max(300) });
export type ExpenseCancel = z.infer<typeof ExpenseCancel>;

export const ReimburseInput = z.object({
  userId: z.string().trim().min(1).max(64),
  amount: money.refine(v => v > 0, 'Enter an amount more than zero'),
  mode:   z.enum(['CASH', 'UPI', 'BANK_TRANSFER']),
  paidAt: day,
  reference: optionalText(80),
});
export type ReimburseInput = z.infer<typeof ReimburseInput>;

export const ExpenseListQuery = z.object({
  tripId:   z.string().trim().max(64).optional(),
  category: ExpenseCategory.optional(),
  paidBy:   PaidBy.optional(),
  paidByUserId: z.string().trim().max(64).optional(),
  from:     day.optional(),
  to:       day.optional(),
  includeCancelled: z.coerce.boolean().optional(),
  q:        z.string().trim().max(100).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ExpenseListQuery = z.infer<typeof ExpenseListQuery>;
