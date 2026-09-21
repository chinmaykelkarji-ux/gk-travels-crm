import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ledgerKeys } from '@/features/ledger/hooks';
import { tripKeys } from '@/features/trips/hooks';
import type { ExpenseListQuery } from '@/shared/contracts/expenses';
import { expensesApi } from './api';

export const expenseKeys = {
  all:  ['expenses'] as const,
  list: (q: Partial<ExpenseListQuery>) => ['expenses', 'list', q] as const,
  owed: ['expenses', 'owed'] as const,
};

export const useExpenses = (q: Partial<ExpenseListQuery>, enabled = true) => useQuery({ queryKey: expenseKeys.list(q), queryFn: () => expensesApi.list(q), enabled, placeholderData: keepPreviousData });
export const useOwed = (enabled = true) => useQuery({ queryKey: expenseKeys.owed, queryFn: expensesApi.owed, enabled });

export function useExpenseMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expenseKeys.all });
      void qc.invalidateQueries({ queryKey: ledgerKeys.all });
      void qc.invalidateQueries({ queryKey: tripKeys.all });
    },
  });
}
