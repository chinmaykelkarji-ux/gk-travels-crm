import { api, type Page } from '@/lib/api';
import type { QuoteCreate, QuoteUpdate, QuoteListQuery, QuoteStatus } from '@/shared/contracts/quotations';
import type { QuoteTotals, PricingBasis, GstMode } from '@/shared/calc/quotation';

export interface QuoteRate { band: 'ADULT' | 'CHILD' | 'INFANT'; count: number; costPrice: number; sellPrice: number }
export interface QuoteItem {
  id: string; serviceType: string; description: string; supplierId: string | null; supplierName: string | null; pricingBasis: PricingBasis;
  costPrice: number; sellPrice: number; quantity: number; nights: number | null; unit: string; serviceDate: string | null; taxRate: number | null;
  rates: QuoteRate[]; optionGroupId: string | null; isSelectedOption: boolean; partyId: string | null; customerNote: string | null; internalNote: string | null;
  details: Record<string, unknown>; sortOrder: number; totals: { included: boolean; cost: number; sell: number; tax: number; margin: number; marginPct: number } | null;
}
export interface Quote {
  id: string; quoteNumber: string; title: string | null; version: number; parentQuoteId: string | null; isCurrent: boolean; status: QuoteStatus;
  approvalStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'; approvalComment: string | null; approvedBy: string | null; approvedAt: string | null;
  enquiryId: string; enquiry: { id: string; enquiryNumber: string | null; destination: string; origin: string | null; departureDate: string | null; returnDate: string | null; adults: number; children: number; infants: number; status: string };
  customerId: string; customer: { id: string; name: string; phone: string; email: string | null; gstNumber: string | null; gstRegistered: boolean; address: string | null };
  adults: number; children: number; infants: number; validUntil: string; gstMode: GstMode; gstRate: number; discountAmount: number;
  notes: string | null; termsConditions: string | null; inclusions: string | null; exclusions: string | null; paymentPolicy: string | null; cancellationPolicy: string | null;
  sentAt: string | null; viewedAt: string | null; acceptedAt: string | null; rejectedAt: string | null; rejectionReason: string | null; convertedTripId: string | null; convertedAt: string | null;
  createdAt: string; updatedAt: string;
  optionGroups: { id: string; name: string; sortOrder: number }[];
  parties: { id: string; name: string; adults: number; children: number; infants: number; travellerIds: string[]; sortOrder: number }[];
  items: QuoteItem[];
  totals: QuoteTotals;
}
export interface QuoteDetail extends Quote {
  versions: { id: string; quoteNumber: string; version: number; status: QuoteStatus; isCurrent: boolean; totalAmount: number; createdAt: string }[];
  activity: { id: string; action: string; description: string | null; timestamp: string; userId: string | null; source: string }[];
}
export interface QuoteListRow {
  id: string; quoteNumber: string; title: string | null; version: number; isCurrent: boolean; status: QuoteStatus; approvalStatus: string;
  customer: { id: string; name: string }; enquiry: { id: string; enquiryNumber: string | null; destination: string; departureDate: string | null };
  pax: number; total: number; margin: number; marginPct: number; validUntil: string; sentAt: string | null; createdAt: string; convertedTripId: string | null;
}
export interface CustomerView {
  quoteNumber: string; title: string | null; version: number; status: string; validUntil: string; sentAt: string | null;
  customer: { name: string; phone: string; email: string | null; address: string | null };
  trip: { destination: string; origin: string | null; departureDate: string | null; returnDate: string | null; adults: number; children: number; infants: number };
  gstMode: GstMode; gstRate: number;
  items: CustomerItem[]; optionGroups: { id: string; name: string; options: CustomerItem[] }[];
  parties: { id: string; name: string; adults: number; children: number; infants: number }[];
  totals: { subtotal: number; discountAmount: number; taxable: number; tax: number; total: number; pax: number; perPerson: number | null; parties: { partyId: string | null; name: string; pax: number; sell: number; tax: number; total: number; perPerson: number | null }[] };
  inclusions: string | null; exclusions: string | null; paymentPolicy: string | null; cancellationPolicy: string | null; termsConditions: string | null; notes: string | null;
  company: { companyName: string; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; pincode: string | null; phone: string | null; email: string | null; gstin: string | null; website: string | null; logoUrl: string | null } | null;
}
export interface CustomerItem { id: string; serviceType: string; description: string; customerNote: string | null; pricingBasis: PricingBasis; quantity: number; nights: number | null; serviceDate: string | null; sellPrice: number | null; rates: { band: string; count: number; sellPrice: number }[]; optionGroupId: string | null; isSelectedOption: boolean; partyId: string | null; amount: number }

export const quotesApi = {
  list:         (q: Partial<QuoteListQuery>) => api.get<Page<QuoteListRow>>('/v2/quotations', q),
  get:          (id: string) => api.get<QuoteDetail>(`/v2/quotations/${id}`),
  customerView: (id: string) => api.get<CustomerView>(`/v2/quotations/${id}/customer-view`),
  create:       (b: QuoteCreate) => api.post<Quote>('/v2/quotations', b),
  update:       (id: string, b: QuoteUpdate) => api.put<Quote>(`/v2/quotations/${id}`, b),
  send:         (id: string) => api.post<Quote>(`/v2/quotations/${id}/send`),
  status:       (id: string, status: QuoteStatus, reason?: string | null) => api.post<Quote>(`/v2/quotations/${id}/status`, { status, reason }),
  approval:     (id: string, approve: boolean, comment?: string | null) => api.post<Quote>(`/v2/quotations/${id}/approval`, { approve, comment }),
  selectOption: (id: string, optionGroupId: string, itemId: string) => api.post<Quote>(`/v2/quotations/${id}/select-option`, { optionGroupId, itemId }),
  newVersion:   (id: string) => api.post<Quote>(`/v2/quotations/${id}/new-version`),
  duplicate:    (id: string) => api.post<Quote>(`/v2/quotations/${id}/duplicate`),
  accept:       (id: string, splitByParty: boolean, note?: string | null) => api.post<{ quote: Quote; bookings: unknown }>(`/v2/quotations/${id}/accept`, { splitByParty, note }),
  remove:       (id: string) => api.delete<{ ok: true }>(`/v2/quotations/${id}`),
};
