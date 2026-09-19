import { api, type Page } from '@/lib/api';
import type { ContractListQuery, ContractStatus, ScheduleInput } from '@/shared/contracts/contracts';
import type { InstalmentState } from '@/shared/calc/schedule';

export interface Contract {
  id: string; contractNumber: string; status: ContractStatus; salesQuoteId: string; quote: { id: string; quoteNumber: string; title: string | null }; enquiryId: string;
  customer: { id: string; name: string; phone: string }; partyId: string | null; partyName: string | null; tripId: string | null;
  trip: { id: string; status: string; paidAmount: number; balanceDue: number } | null; destination: string; departureDate: string | null; returnDate: string | null;
  adults: number; children: number; infants: number; travellerIds: string[]; subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number; costAmount: number;
  gstMode: string; gstRate: number; paymentPolicy: string | null; cancellationPolicy: string | null; notes: string | null; cancelledAt: string | null; cancellationReason: string | null; completedAt: string | null; createdAt: string;
  schedule: (Omit<InstalmentState, 'status'> & { id?: string; status: InstalmentState['status'] | 'NOT_TRACKED' })[]; received: number | null;
  payments: { total: number; paid: number | null; balance: number | null; overdue: number; next: InstalmentState | null };
  /** TOUR: several families share the trip; receipts are recorded on the tour until per-party payments exist. */
  paymentTracking: 'CONTRACT' | 'TOUR';
}
export interface ContractDetail extends Contract {
  services: { id: string; type: string; status: string; serviceDate: string | null; supplier: { id: string; name: string } | null; costPrice: number; sellPrice: number; notes: string | null; details: Record<string, unknown> }[];
  activity: { id: string; action: string; description: string | null; timestamp: string; userId: string | null; source: string }[];
}
export interface PaymentDue { contractId: string; contractNumber: string; customer: { id: string; name: string; phone: string }; tripId: string | null; destination: string; seq: number; label: string; dueDate: string; amount: number; paidAmount: number; status: string; outstanding: number }

export const contractsApi = {
  list:        (q: Partial<ContractListQuery>) => api.get<Page<Contract>>('/v2/contracts', q),
  get:         (id: string) => api.get<ContractDetail>(`/v2/contracts/${id}`),
  paymentsDue: (days = 7) => api.get<PaymentDue[]>('/v2/contracts/payments-due', { days }),
  setSchedule: (id: string, body: ScheduleInput) => api.put<ContractDetail>(`/v2/contracts/${id}/schedule`, body),
  status:      (id: string, status: ContractStatus, reason?: string | null) => api.post<ContractDetail>(`/v2/contracts/${id}/status`, { status, reason }),
  notes:       (id: string, notes: string | null) => api.put<ContractDetail>(`/v2/contracts/${id}/notes`, { notes }),
};
