import { api, type Page } from '@/lib/api';
import type { AccountType } from '@/shared/calc/ledger';
import type { LedgerEntriesQuery, LedgerPeriodQuery, ManualEntry } from '@/shared/contracts/ledger';

export interface AccountRow { code: string; name: string; type: AccountType; group: string; description: string | null; isActive: boolean; isSystem: boolean; balance: number }
export interface EntryLine { id: string; code: string; debit: number; credit: number; description: string | null; tripId: string | null; contractId: string | null; customerId: string | null; vendorId: string | null }
export interface LedgerEntry {
  id: string; displayNumber: string; date: string; narration: string; sourceType: string; sourceId: string | null;
  tripId: string | null; contractId: string | null; customerId: string | null; vendorId: string | null; source: string;
  postedAt: string; createdById: string | null; amount: number; lines: EntryLine[];
  reversalOf: { id: string; displayNumber: string } | null; reversedBy: { id: string; displayNumber: string } | null; reversalReason: string | null;
}
export interface TrialBalance {
  from: string | null; to: string | null; totalDebit: number; totalCredit: number; difference: number;
  accounts: { code: string; name: string; type: AccountType; group: string; debit: number; credit: number; balance: number }[];
  byType: Record<AccountType, number>;
}
export interface Statement {
  account: { code: string; name: string; type: AccountType; group: string; description: string | null };
  from: string | null; to: string | null; opening: number; closing: number;
  rows: { id: string; entryId: string; displayNumber: string; date: string; narration: string; description: string | null; sourceType: string; tripId: string | null; contractId: string | null; debit: number; credit: number; balance: number }[];
}

export const ledgerApi = {
  accounts:     () => api.get<AccountRow[]>('/v2/ledger/accounts'),
  trialBalance: (q: LedgerPeriodQuery) => api.get<TrialBalance>('/v2/ledger/trial-balance', q),
  statement:    (code: string, q: LedgerPeriodQuery) => api.get<Statement>(`/v2/ledger/accounts/${code}/statement`, q),
  entries:      (q: Partial<LedgerEntriesQuery>) => api.get<Page<LedgerEntry>>('/v2/ledger/entries', q),
  entry:        (id: string) => api.get<LedgerEntry>(`/v2/ledger/entries/${id}`),
  create:       (b: ManualEntry) => api.post<LedgerEntry>('/v2/ledger/entries', b),
  reverse:      (id: string, reason: string) => api.post<LedgerEntry>(`/v2/ledger/entries/${id}/reverse`, { reason }),
};
