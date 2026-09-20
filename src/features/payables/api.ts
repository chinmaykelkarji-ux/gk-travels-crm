import { api, type Page } from '@/lib/api';
import type { BillCategory, PayablesQuery, VendorBillInput, VendorPaymentInput } from '@/shared/contracts/payables';

export interface VendorBill {
  id: string; vendorId: string; vendor: { id: string; name: string; phone: string | null; kind: string } | null;
  billNumber: string; billDate: string; dueDate: string | null; category: BillCategory; categoryLabel: string;
  amount: number; gstAmount: number; netAmount: number; paid: number; outstanding: number;
  status: 'OPEN' | 'PAID' | 'CANCELLED'; daysOverdue: number;
  tripId: string | null; trip: { id: string; label: string } | null; contractId: string | null;
  description: string | null; notes: string | null; ledgerTransactionId: string | null;
  cancelledAt: string | null; cancelReason: string | null; legacyPayableId: string | null;
  payments: { id: string; amount: number; paidAt: string; mode: string; reference: string | null }[]; createdAt: string;
}
export interface VendorPayment {
  id: string; vendorId: string; vendor: { id: string; name: string } | null; billId: string | null;
  bill: { id: string; billNumber: string; amount: number } | null; tripId: string | null; trip: { id: string; label: string } | null;
  amount: number; mode: string; paidAt: string; reference: string | null; notes: string | null; status: 'POSTED' | 'CANCELLED';
  ledgerTransactionId: string | null; cancelledAt: string | null; cancelReason: string | null; legacyPaymentId: string | null; createdAt: string;
}
export interface BillPage extends Page<VendorBill> { totals: { outstanding: number; billed: number } }
export interface Aging {
  today: string; total: number; overdue: number; unappliedAdvances: number;
  buckets: { key: string; label: string; amount: number }[];
  vendors: { vendorId: string; vendor: string; bills: number; outstanding: number; overdue: number }[];
  bills: VendorBill[];
}
export interface VendorStatement { vendor: { id: string; name: string }; bills: VendorBill[]; payments: VendorPayment[]; outstanding: number; overdue: number; unappliedAdvances: number }
export interface PayablesImport { bills: number; payments: number; skipped: number; supplierPaymentsLeft: number }

export const payablesApi = {
  aging:      () => api.get<Aging>('/v2/payables/aging'),
  bills:      (q: Partial<PayablesQuery>) => api.get<BillPage>('/v2/payables/bills', q),
  bill:       (id: string) => api.get<VendorBill>(`/v2/payables/bills/${id}`),
  createBill: (b: VendorBillInput) => api.post<VendorBill>('/v2/payables/bills', b),
  cancelBill: (id: string, reason: string) => api.post<VendorBill>(`/v2/payables/bills/${id}/cancel`, { reason }),
  payments:   (q: Partial<PayablesQuery>) => api.get<Page<VendorPayment>>('/v2/payables/payments', q),
  pay:        (b: VendorPaymentInput) => api.post<VendorPayment>('/v2/payables/payments', b),
  cancelPay:  (id: string, reason: string) => api.post<VendorPayment>(`/v2/payables/payments/${id}/cancel`, { reason }),
  applyAdvance: (id: string, billId: string) => api.post<VendorPayment>(`/v2/payables/payments/${id}/apply`, { billId }),
  statement:  (vendorId: string) => api.get<VendorStatement>(`/v2/payables/vendors/${vendorId}/statement`),
  importClassic: () => api.post<PayablesImport>('/v2/payables/import-classic'),
};
