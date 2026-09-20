import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ledgerKeys } from '@/features/ledger/hooks';
import { tripKeys } from '@/features/trips/hooks';
import type { PayablesQuery } from '@/shared/contracts/payables';
import { payablesApi } from './api';

export const payableKeys = {
  all:       ['payables'] as const,
  aging:     ['payables', 'aging'] as const,
  bills:     (q: Partial<PayablesQuery>) => ['payables', 'bills', q] as const,
  payments:  (q: Partial<PayablesQuery>) => ['payables', 'payments', q] as const,
  statement: (vendorId: string) => ['payables', 'statement', vendorId] as const,
};

export const useAging = (enabled = true) => useQuery({ queryKey: payableKeys.aging, queryFn: payablesApi.aging, enabled });
export const useBills = (q: Partial<PayablesQuery>, enabled = true) => useQuery({ queryKey: payableKeys.bills(q), queryFn: () => payablesApi.bills(q), enabled, placeholderData: keepPreviousData });
export const useVendorPayments = (q: Partial<PayablesQuery>, enabled = true) => useQuery({ queryKey: payableKeys.payments(q), queryFn: () => payablesApi.payments(q), enabled, placeholderData: keepPreviousData });
export const useVendorStatement = (vendorId: string, enabled = true) => useQuery({ queryKey: payableKeys.statement(vendorId), queryFn: () => payablesApi.statement(vendorId), enabled: enabled && !!vendorId });

/** Supplier money changes the books and trip costs too. */
export function usePayableMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payableKeys.all });
      void qc.invalidateQueries({ queryKey: ledgerKeys.all });
      void qc.invalidateQueries({ queryKey: tripKeys.all });
    },
  });
}
