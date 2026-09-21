import { api, type Page } from '@/lib/api';
import type { ExpenseCategory, ExpenseInput, ExpenseListQuery, PaidBy, ReimburseInput } from '@/shared/contracts/expenses';

export interface Expense {
  id: string; date: string; category: ExpenseCategory; categoryLabel: string; amount: number; gstAmount: number;
  paidBy: PaidBy; paidByLabel: string; paidByUserId: string | null; paidByUser: { id: string; name: string } | null;
  tripId: string | null; trip: { id: string; label: string } | null; contractId: string | null;
  vendorId: string | null; vendor: { id: string; name: string } | null;
  description: string; notes: string | null; documentId: string | null; status: 'POSTED' | 'CANCELLED';
  ledgerTransactionId: string | null; cancelledAt: string | null; cancelReason: string | null; createdAt: string; createdById: string | null;
}
export interface ExpensePage extends Page<Expense> { byCategory: { category: string; label: string; amount: number }[]; total_spent: number }
export interface Owed { userId: string; name: string; owed: number }

export const expensesApi = {
  list:   (q: Partial<ExpenseListQuery>) => api.get<ExpensePage>('/v2/expenses', q),
  create: (b: ExpenseInput) => api.post<Expense>('/v2/expenses', b),
  cancel: (id: string, reason: string) => api.post<Expense>(`/v2/expenses/${id}/cancel`, { reason }),
  owed:   () => api.get<Owed[]>('/v2/expenses/reimbursements'),
  reimburse: (b: ReimburseInput) => api.post<{ id: string; owed: Owed[] }>('/v2/expenses/reimbursements', b),
};
