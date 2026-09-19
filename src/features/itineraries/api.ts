import { api } from '@/lib/api';
import type { CustomerItinerary, ItemKind, SourceType } from '@/shared/calc/itinerary';
import type { ItineraryCreate, ItinerarySave } from '@/shared/contracts/itineraries';

export interface ItineraryItemView {
  id?: string; time: string | null; kind: ItemKind; title: string; details: string | null;
  internalNote: string | null; internalCost: number | null; customerVisible: boolean;
  sourceType: SourceType | null; sourceId: string | null;
}
export interface ItineraryDayView {
  id?: string; dayNumber: number; date: string | null; title: string; morning: string | null; afternoon: string | null; evening: string | null;
  hotelName: string | null; hotelAddress: string | null; meals: string[]; transfers: string | null; notes: string | null; internalNotes: string | null;
  items: ItineraryItemView[];
}
export interface ItineraryView {
  id: string; tripId: string | null; title: string; destination: string; customerName: string; startDate: string | null; endDate: string | null; pax: number;
  revision: number; notes: string | null; internalNotes: string | null; emergencyContact: string | null; days: ItineraryDayView[];
  format: 'CLASSIC' | 'V2'; status: string; sharedRevision: number | null; sharedAt: string | null; updatedAt: string; canSeeCost: boolean;
  trip: { departure: string | null; returnDate: string | null; stage: string; days: number } | null;
  warnings: { datesOutOfStep: boolean; daysBeyondTrip: number[]; notShared: boolean; changedSinceShared: boolean };
}
export interface SyncResult { added: number; updated: number; removed: number; daysAdded: number; daysRemoved: number; staysSet: number; unplaced: { title: string; date: string }[]; daysBeyondTrip: number[]; noDates: boolean }
export interface ItineraryListRow { id: string; title: string; destination: string; tripId: string | null; startDate: string | null; format: string; days: number }

export const itinerariesApi = {
  byTrip:   (tripId: string) => api.get<{ itinerary: ItineraryView | null }>(`/v2/itineraries/by-trip/${tripId}`),
  get:      (id: string) => api.get<ItineraryView>(`/v2/itineraries/${id}`),
  list:     (search?: string) => api.get<ItineraryListRow[]>('/v2/itineraries', { search }),
  create:   (body: ItineraryCreate) => api.post<ItineraryView>('/v2/itineraries', body),
  save:     (id: string, body: ItinerarySave) => api.put<ItineraryView>(`/v2/itineraries/${id}`, body),
  sync:     (id: string) => api.post<{ itinerary: ItineraryView; result: SyncResult }>(`/v2/itineraries/${id}/sync`),
  share:    (id: string) => api.post<ItineraryView>(`/v2/itineraries/${id}/share`),
  remove:   (id: string) => api.delete<{ ok: true }>(`/v2/itineraries/${id}`),
  customer: (id: string) => api.get<CustomerItinerary>(`/v2/itineraries/${id}/customer`),
};
