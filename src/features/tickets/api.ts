import { api, type Page } from '@/lib/api';
import type { BulkStatusInput, PassengerInput, PassengerRowUpdate, PassengerStatus, SegmentInput, TicketCancel, TicketInput, TicketListQuery, TicketMode, TicketStatus, TicketUpdate } from '@/shared/contracts/tickets';

export interface TicketRow {
  id: string; paxIndex: number; travellerId: string | null; name: string; paxType: string; status: PassengerStatus; bookingStatus: string | null; currentStatus: string | null;
  waitlistPosition: number | null; coach: string | null; seat: string | null; berth: string | null; ticketNumber: string | null; boardingPoint: string | null; fare: number | null;
}
export interface TicketSegment {
  id: string; seq: number; carrierNumber: string | null; carrierName: string | null; fromCode: string | null; fromName: string; toCode: string | null; toName: string;
  departAt: string | null; arriveAt: string | null; departLocal: string | null; arriveLocal: string | null; travelClass: string | null; boardingPoint: string | null;
  droppingPoint: string | null; terminal: string | null; platform: string | null; baggage: string | null; passengers: TicketRow[];
}
export interface Ticket {
  id: string; displayNumber: string | null; mode: TicketMode; status: TicketStatus; pnr: string | null; carrier: string | null; bookingRef: string | null; quota: string | null; travelClass: string | null;
  tripId: string | null; trip: { id: string; destination: string } | null; contractId: string | null; customerId: string | null; customer: { id: string; name: string; phone: string } | null;
  vendorId: string | null; vendor: { id: string; name: string } | null; sourceDocumentId: string | null;
  fare: { baseFare: number | null; taxes: number | null; otherCharges: number | null; totalFare: number | null; serviceFee: number | null; serviceFeeGstPct: number | null; serviceFeeGst: number | null; costAmount: number | null };
  chartPrepared: boolean; chartCheckedAt: string | null; cancelReason: string | null; cancelledAt: string | null; customerNotes: string | null; internalNotes: string | null;
  legacyBookingId: string | null; createdAt: string; route: string; departAt: string | null; departLocal: string | null; segments: TicketSegment[];
  passengers: { paxIndex: number; travellerId: string | null; name: string; paxType: string; age: number | null; gender: string | null; statuses: PassengerStatus[] }[]; paxCount: number;
  activity?: { id: string; action: string; description: string | null; timestamp: string; source: string }[];
}

export const ticketsApi = {
  list:          (q: Partial<TicketListQuery>) => api.get<Page<Ticket>>('/v2/tickets', q),
  get:           (id: string) => api.get<Ticket>(`/v2/tickets/${id}`),
  create:        (b: TicketInput) => api.post<Ticket>('/v2/tickets', b),
  update:        (id: string, b: TicketUpdate) => api.put<Ticket>(`/v2/tickets/${id}`, b),
  addSegment:    (id: string, b: SegmentInput) => api.post<Ticket>(`/v2/tickets/${id}/segments`, b),
  updateSegment: (segId: string, b: SegmentInput) => api.put<Ticket>(`/v2/tickets/segments/${segId}`, b),
  deleteSegment: (segId: string) => api.delete<Ticket>(`/v2/tickets/segments/${segId}`),
  addPassengers: (id: string, passengers: PassengerInput[]) => api.post<Ticket>(`/v2/tickets/${id}/passengers`, { passengers }),
  removePassenger: (id: string, paxIndex: number) => api.delete<Ticket>(`/v2/tickets/${id}/passengers/${paxIndex}`),
  updateRow:     (rowId: string, b: PassengerRowUpdate) => api.put<Ticket>(`/v2/tickets/rows/${rowId}`, b),
  bulkStatuses:  (id: string, b: BulkStatusInput) => api.post<Ticket>(`/v2/tickets/${id}/statuses`, b),
  cancel:        (id: string, b: TicketCancel) => api.post<Ticket>(`/v2/tickets/${id}/cancel`, b),
  importClassic: () => api.post<{ tickets: number; hotels: number; vehicles: number; activities: number; skipped: number }>('/v2/tickets/import-classic'),
};
