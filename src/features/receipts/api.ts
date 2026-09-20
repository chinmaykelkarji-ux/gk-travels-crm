import { api, type Page } from '@/lib/api';
import type { ReceiptInput, ReceiptKind, ReceiptListQuery, ReceiptMode } from '@/shared/contracts/receipts';

export interface Receipt {
  id: string; kind: ReceiptKind; status: 'POSTED' | 'CANCELLED'; amount: number; mode: ReceiptMode; modeLabel: string;
  receivedAt: string; reference: string | null; notes: string | null;
  contractId: string | null; contract: { id: string; contractNumber: string; partyName: string | null } | null;
  tripId: string | null; trip: { id: string; label: string } | null;
  customerId: string | null; customer: { id: string; name: string; phone: string | null } | null;
  ledgerTransactionId: string | null; cancelledAt: string | null; cancelReason: string | null; legacyPaymentId: string | null; createdAt: string;
}
export interface ReceiptPage extends Page<Receipt> { totals: { received: number; refunded: number; net: number } }
export interface DayBook { day: string; receipts: Receipt[]; byMode: { mode: string; label: string; amount: number }[]; total: number }
export interface ImportResult { imported: number; skipped: number; unsorted: number; trips: string[] }

export const receiptsApi = {
  list:    (q: Partial<ReceiptListQuery>) => api.get<ReceiptPage>('/v2/receipts', q),
  dayBook: (day?: string) => api.get<DayBook>('/v2/receipts/day-book', { day }),
  create:  (b: ReceiptInput) => api.post<Receipt>('/v2/receipts', b),
  cancel:  (id: string, reason: string) => api.post<Receipt>(`/v2/receipts/${id}/cancel`, { reason }),
  importClassic: () => api.post<ImportResult>('/v2/receipts/import-classic'),
};
