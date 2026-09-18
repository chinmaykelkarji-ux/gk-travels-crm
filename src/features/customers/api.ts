import { api, type Page } from '@/lib/api';
import type { CustomerCreate, CustomerUpdate, CustomerListQuery, CustomerSummary, RelationshipCreate } from '@/shared/contracts/customers';

export interface CustomerRecord {
  id: string; customerNumber: number; name: string; phone: string; altPhone: string | null; email: string | null;
  type: 'INDIVIDUAL' | 'CORPORATE'; companyName: string | null; gstNumber: string | null; gstRegistered: boolean;
  address: string | null; billingAddress: string | null; city: string | null; state: string | null;
  source: string | null; referredByCustomerId: string | null; passportNo: string | null; passportExpiry: string | null;
  passportCountry: string | null; panNumber: string | null; tags: string[]; preferences: Record<string, string>;
  notes: string | null; createdAt: string; updatedAt: string; deletedAt: string | null; mergedIntoId: string | null;
}

export interface Customer360 {
  customer: CustomerRecord & {
    referredBy: { id: string; name: string } | null;
    relationships: { id: string; kind: string; note: string | null; customer: { id: string; name: string; phone: string } }[];
  };
  stats: { tripCount: number; lifetimeValue: number; lifetimePaid: number; outstanding: number; invoiced: number; received: number; lastTripAt: string | null };
  trips: { id: string; tripNumber: number | null; destination: string; departure: string | null; returnDate: string | null; status: string; pax: number; totalPayable: number | null; paidAmount: number | null; balanceDue: number | null }[];
  enquiries: { id: string; destination: string | null; departureDate: string | null; pax: number | null; status: string; createdAt: string }[];
  quotations: { id: string; number: string | null; status: string; total: number; createdAt: string; convertedTripId: string | null; engine: 'sales' | 'legacy' }[];
  invoices: { id: string; invoiceNumber: string; invoiceDate: string; status: string; totalAmount: number; receivableId: string | null }[];
  payments: { id: string; amount: number; method: string; date: string; status: string; tripId: string | null; reference: string | null }[];
  travellers: { id: string; firstName: string; lastName: string; dateOfBirth: string | null; passportNumber: string | null; passportExpiry: string | null; nationality: string | null }[];
  documents: { id: string; linkId: string; role: string | null; title: string; type: string; status: string; fileName: string; expiresAt: string | null; createdAt: string }[];
  tasks: { id: string; title: string; dueDate: string | null; priority: string; status: string; assignedTo: string | null }[];
  referrals: { id: string; name: string; createdAt: string }[];
  activity: { id: string; action: string; title: string | null; description: string | null; timestamp: string; userId: string | null; source: string }[];
}

export interface DuplicateCandidate { id: string; name: string; phone: string; email: string | null; customerNumber: number; reason: 'phone' | 'email' }
export interface DuplicateGroup { phoneNormalized: string; customers: { id: string; name: string; phone: string; email: string | null; customerNumber: number; createdAt: string }[] }

export const customersApi = {
  list:            (q: Partial<CustomerListQuery>) => api.get<Page<CustomerSummary>>('/v2/customers', q),
  get:             (id: string) => api.get<Customer360>(`/v2/customers/${id}`),
  create:          (body: CustomerCreate) => api.post<CustomerRecord>('/v2/customers', body),
  update:          (id: string, body: CustomerUpdate) => api.put<CustomerRecord>(`/v2/customers/${id}`, body),
  remove:          (id: string) => api.delete<{ ok: true }>(`/v2/customers/${id}`),
  revealPassport:  (id: string) => api.post<{ field: string; value: string }>(`/v2/customers/${id}/reveal`, {}),
  merge:           (targetId: string, sourceId: string) => api.post<{ target: CustomerRecord; moved: Record<string, number> }>(`/v2/customers/${targetId}/merge`, { sourceId }),
  checkDuplicates: (q: { phone?: string; email?: string; excludeId?: string }) => api.get<DuplicateCandidate[]>('/v2/customers/check-duplicates', q),
  duplicateGroups: () => api.get<DuplicateGroup[]>('/v2/customers/duplicates'),
  addRelationship: (id: string, body: RelationshipCreate) => api.post<{ id: string }>(`/v2/customers/${id}/relationships`, body),
  removeRelationship: (id: string, relId: string) => api.delete<{ ok: true }>(`/v2/customers/${id}/relationships/${relId}`),
};
