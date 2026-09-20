import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ledgerKeys } from '@/features/ledger/hooks';
import { tripKeys } from '@/features/trips/hooks';
import { contractKeys } from '@/features/contracts/hooks';
import type { ReceiptListQuery } from '@/shared/contracts/receipts';
import { receiptsApi } from './api';

export const receiptKeys = {
  all:  ['receipts'] as const,
  list: (q: Partial<ReceiptListQuery>) => ['receipts', 'list', q] as const,
  day:  (day: string) => ['receipts', 'day', day] as const,
};

export const useReceipts = (q: Partial<ReceiptListQuery>, enabled = true) => useQuery({ queryKey: receiptKeys.list(q), queryFn: () => receiptsApi.list(q), enabled, placeholderData: keepPreviousData });
export const useDayBook = (day: string) => useQuery({ queryKey: receiptKeys.day(day), queryFn: () => receiptsApi.dayBook(day) });

/** Money moves balances, the books and the trip: refresh all three. */
export function useReceiptMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: receiptKeys.all });
      void qc.invalidateQueries({ queryKey: ledgerKeys.all });
      void qc.invalidateQueries({ queryKey: tripKeys.all });
      void qc.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}
