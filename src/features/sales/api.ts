import { api, type Page } from '@/lib/api';
import type { LeadCreate, LeadUpdate, LeadListQuery, LeadStatus, LeadConvert, EnquiryCreate, EnquiryUpdate, EnquiryListQuery, EnquiryStatus } from '@/shared/contracts/sales';

export interface TeamMember { id: string; name: string; role: string }
export interface Assignee { id: string; name: string; role: string }
export interface TimelineEntry { at: string; type: string; text: string; userId?: string | null }
export interface ActivityRow { id: string; action: string; description: string | null; timestamp: string; userId: string | null; source: string }

export interface Lead {
  id: string; name: string; phone: string; phoneNormalized: string | null; email: string | null; source: string; destination: string;
  travelDate: string | null; pax: number; budget: number | null; tripType: string; status: LeadStatus; priority: 'low' | 'medium' | 'high';
  notes: string; followUpDate: string | null; assignedTo: string | null; assignedToUserId: string | null; assignee: Assignee | null;
  lostReason: string | null; convertedCustomerId: string | null; convertedEnquiryId: string | null; convertedAt: string | null;
  lastContactedAt: string | null; timeline: TimelineEntry[]; createdAt: string; updatedAt: string;
}
export interface LeadDetail extends Lead {
  convertedCustomer: { id: string; name: string } | null;
  convertedEnquiry: { id: string; enquiryNumber: string | null; status: string; destination: string } | null;
  activity: ActivityRow[];
}

export interface Enquiry {
  id: string; enquiryNumber: string | null; customerId: string; leadId: string | null; source: string; destination: string; origin: string | null;
  departureDate: string | null; returnDate: string | null; flexibleDates: boolean; adults: number; children: number; infants: number; pax: number; rooms: number | null;
  tripType: string | null; hotelCategory: string | null; mealPlan: string | null; budget: number | null; budgetMax: number | null; requirements: string | null;
  preferences: Record<string, string>; priority: 'low' | 'medium' | 'high'; status: EnquiryStatus; assignedTo: string | null; assignedToUserId: string | null; assignee: Assignee | null;
  notes: string | null; lostReason: string | null; wonAt: string | null; lostAt: string | null; quoteCount: number; createdAt: string; updatedAt: string;
  customer: { id: string; name: string; phone: string; email: string | null; city: string | null };
}
export interface EnquiryDetail extends Enquiry {
  lead: { id: string; name: string; source: string; status: string } | null;
  quotes: { id: string; quoteNumber: string; status: string; totalAmount: number; validUntil: string; createdAt: string; convertedTripId: string | null }[];
  tasks: { id: string; title: string; dueDate: string | null; status: string; priority: string; assignedTo: string | null }[];
  activity: ActivityRow[];
}

export const salesApi = {
  team: () => api.get<TeamMember[]>('/v2/me/team'),
  leads: {
    list:    (q: Partial<LeadListQuery>) => api.get<Page<Lead>>('/v2/leads', q),
    get:     (id: string) => api.get<LeadDetail>(`/v2/leads/${id}`),
    create:  (b: LeadCreate) => api.post<Lead>('/v2/leads', b),
    update:  (id: string, b: LeadUpdate) => api.put<Lead>(`/v2/leads/${id}`, b),
    status:  (id: string, b: { status: LeadStatus; lostReason?: string | null; note?: string | null }) => api.post<Lead>(`/v2/leads/${id}/status`, b),
    assign:  (id: string, userId: string | null) => api.post<Lead>(`/v2/leads/${id}/assign`, { userId }),
    note:    (id: string, note: string) => api.post<Lead>(`/v2/leads/${id}/notes`, { note }),
    convert: (id: string, b: LeadConvert) => api.post<{ lead: Lead; customerId: string; enquiry: Enquiry }>(`/v2/leads/${id}/convert`, b),
    remove:  (id: string) => api.delete<{ ok: true }>(`/v2/leads/${id}`),
    checkDuplicates: (phone: string) => api.get<{ leads: { id: string; name: string; status: string }[]; customers: { id: string; name: string }[] }>('/v2/leads/check-duplicates', { phone }),
  },
  enquiries: {
    list:     (q: Partial<EnquiryListQuery>) => api.get<Page<Enquiry>>('/v2/enquiries', q),
    get:      (id: string) => api.get<EnquiryDetail>(`/v2/enquiries/${id}`),
    create:   (b: EnquiryCreate) => api.post<Enquiry>('/v2/enquiries', b),
    update:   (id: string, b: EnquiryUpdate) => api.put<Enquiry>(`/v2/enquiries/${id}`, b),
    status:   (id: string, b: { status: EnquiryStatus; lostReason?: string | null; note?: string | null }) => api.post<EnquiryDetail>(`/v2/enquiries/${id}/status`, b),
    assign:   (id: string, userId: string | null) => api.post<EnquiryDetail>(`/v2/enquiries/${id}/assign`, { userId }),
    note:     (id: string, note: string) => api.post<EnquiryDetail>(`/v2/enquiries/${id}/notes`, { note }),
    followUp: (id: string, b: { dueDate: string; title?: string; note?: string | null; assignedToUserId?: string | null }) => api.post<{ id: string }>(`/v2/enquiries/${id}/follow-up`, b),
    remove:   (id: string) => api.delete<{ ok: true }>(`/v2/enquiries/${id}`),
  },
};
