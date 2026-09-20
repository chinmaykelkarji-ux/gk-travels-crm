import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LedgerEntriesQuery, LedgerPeriodQuery } from '@/shared/contracts/ledger';
import { ledgerApi } from './api';

export const ledgerKeys = {
  all:       ['ledger'] as const,
  accounts:  ['ledger', 'accounts'] as const,
  trial:     (q: LedgerPeriodQuery) => ['ledger', 'trial', q] as const,
  statement: (code: string, q: LedgerPeriodQuery) => ['ledger', 'statement', code, q] as const,
  entries:   (q: Partial<LedgerEntriesQuery>) => ['ledger', 'entries', q] as const,
};

export const useAccounts = () => useQuery({ queryKey: ledgerKeys.accounts, queryFn: ledgerApi.accounts, staleTime: 60_000 });
export const useTrialBalance = (q: LedgerPeriodQuery, enabled = true) => useQuery({ queryKey: ledgerKeys.trial(q), queryFn: () => ledgerApi.trialBalance(q), enabled, placeholderData: keepPreviousData });
export const useStatement = (code: string, q: LedgerPeriodQuery, enabled = true) => useQuery({ queryKey: ledgerKeys.statement(code, q), queryFn: () => ledgerApi.statement(code, q), enabled: enabled && !!code, placeholderData: keepPreviousData });
export const useEntries = (q: Partial<LedgerEntriesQuery>, enabled = true) => useQuery({ queryKey: ledgerKeys.entries(q), queryFn: () => ledgerApi.entries(q), enabled, placeholderData: keepPreviousData });

/** Any posting changes balances everywhere: refresh the whole ledger. */
export function useLedgerMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { void qc.invalidateQueries({ queryKey: ledgerKeys.all }); } });
}
