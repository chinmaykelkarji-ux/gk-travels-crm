import { api, type Page } from '@/lib/api';
import type { TravellerCreate, TravellerUpdate, TravellerListQuery, TravellerSummary, TripTravellersPut } from '@/shared/contracts/travellers';
import type { PassportStatus } from '@/shared/calc/travellers';

export interface TravellerRecord {
  id: string; customerId: string | null; title: string | null; firstName: string; lastName: string; displayName: string | null;
  dateOfBirth: string | null; gender: string | null; nationality: string | null; relationToCustomer: string | null;
  phone: string | null; email: string | null; passportNumber: string | null; passportIssueDate: string | null; passportExpiry: string | null;
  placeOfIssue: string | null; govtIdType: string | null; govtIdNumber: string | null; visaStatus: string | null; visaExpiry: string | null;
  visaCountry: string | null; visaType: string | null; frequentFlyerNumber: string | null; mealPreference: string | null; seatPreference: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null; emergencyRelation: string | null; notes: string | null;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

export interface TravellerDetail extends TravellerRecord {
  passportStatus: PassportStatus;
  customer: { id: string; name: string; phone: string } | null;
  trips: { id: string; role: string; position: number; destination: string; departure: string | null; returnDate: string | null; status: string; passportStatus: PassportStatus }[];
}

export interface TripTravellerRow extends TravellerSummary { linkId: string; role: 'LEAD' | 'ADULT' | 'CHILD' | 'INFANT'; position: number }

export interface PassportAlert {
  id: string; name: string; customer: { id: string; name: string; phone: string } | null; passportNumber: string | null; passportExpiry: string | null;
  status: PassportStatus; upcomingTrips: { id: string; destination: string; departure: string | null; status: PassportStatus }[];
}

export const travellersApi = {
  list:   (q: Partial<TravellerListQuery>) => api.get<Page<TravellerSummary>>('/v2/travellers', q),
  get:    (id: string) => api.get<TravellerDetail>(`/v2/travellers/${id}`),
  create: (body: TravellerCreate) => api.post<TravellerRecord>('/v2/travellers', body),
  update: (id: string, body: TravellerUpdate) => api.put<TravellerRecord>(`/v2/travellers/${id}`, body),
  remove: (id: string) => api.delete<{ ok: true }>(`/v2/travellers/${id}`),
  alerts: (days = 180) => api.get<PassportAlert[]>('/v2/travellers/passport-alerts', { days }),
  tripTravellers:    (tripId: string) => api.get<{ tripId: string; pax: number; departure: string | null; travellers: (TripTravellerRow & { passportStatus: PassportStatus })[] }>(`/v2/trips/${tripId}/travellers`),
  setTripTravellers: (tripId: string, body: TripTravellersPut) => api.put<{ tripId: string; travellers: TripTravellerRow[] }>(`/v2/trips/${tripId}/travellers`, body),
};
