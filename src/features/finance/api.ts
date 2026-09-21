import { api } from '@/lib/api';

export interface AgedInvoiceRow { id: string; number: string; date: string; dueDate: string | null; total: number; outstanding: number; daysOverdue: number; bucket: string }
export interface CustomerDues {
  key: string; customerId: string | null; customerName: string;
  outstanding: number; overdue: number; unusedAdvance: number; net: number; received: number; invoices: AgedInvoiceRow[];
}
export interface Receivables {
  today: string; total: number; overdue: number;
  buckets: { key: string; label: string; amount: number }[];
  customers: CustomerDues[];
}
export interface TripProfit {
  trip: { id: string; label: string; stage: string };
  revenue: number; revenueBasis: 'invoiced' | 'contracted'; actualCost: number; plannedCost: number;
  margin: number; marginPct: number; received: number; balance: number;
  costLines: { label: string; actual: number; planned: number }[];
}

export const financeApi = {
  receivables: () => api.get<Receivables>('/v2/finance/receivables'),
  tripProfit:  (tripId: string) => api.get<TripProfit>(`/v2/finance/trips/${tripId}/profit`),
};
