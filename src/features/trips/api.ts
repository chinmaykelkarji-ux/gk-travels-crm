import { api, type Page } from '@/lib/api';
import type { Check, TripStage } from '@/shared/calc/tripStage';
import type { PickupPointsPut, TravellerAssignments, TripCreate, TripListQuery, TripUpdate } from '@/shared/contracts/trips';
import type {
  ActivityBookingInput, ActivityBookingUpdate, AssignmentStatusChange, HotelBookingInput, HotelBookingUpdate, OpsStatus, OpsStatusChange,
  VehicleAssignmentInput, VehicleAssignmentUpdate, AssignmentStatus, DriverDutyStatus,
} from '@/shared/contracts/operations';
import type { Ticket } from '@/features/tickets/api';
import type { PassportStatus } from '@/shared/calc/travellers';

export interface TripListItem {
  id: string; tourName: string | null; destination: string; customer: string; customerId: string | null; departure: string | null; returnDate: string | null;
  pax: number; stage: TripStage; isInternational: boolean; assignedOps: { id: string; name: string } | null; parties: number; travellers: number;
  pending: { hotels: number; vehicles: number; activities: number; tickets: number };
}

type Money = { costAmount: number | null; sellAmount: number | null };
export interface HotelBookingRow extends Money {
  id: string; tripId: string; contractId: string | null; hotelId: string | null; hotel: { id: string; name: string; city: string; phone: string | null; address: string | null } | null;
  hotelName: string; city: string | null; roomTypeId: string | null; roomTypeName: string | null; mealPlan: string | null; checkIn: string; checkOut: string; nights: number;
  rooms: number; adults: number; children: number; travellerIds: string[]; status: OpsStatus; confirmationNo: string | null; vendorId: string | null; vendor: { id: string; name: string; phone: string } | null;
  customerNotes: string | null; internalNotes: string | null; confirmedAt: string | null; cancelReason: string | null; legacyBookingId: string | null; rateGaps?: string[];
}
export interface VehicleDutyRow extends Money {
  id: string; tripId: string; contractId: string | null; vehicleId: string | null; vehicle: { id: string; registrationNo: string; type: string; seats: number } | null;
  driverId: string | null; driver: { id: string; name: string; phone: string } | null; vendorId: string | null; vendor: { id: string; name: string; phone: string } | null;
  vehicleType: string | null; seatsRequired: number | null; vehicleRegNo: string | null; driverName: string | null; driverPhone: string | null;
  startAt: string; endAt: string; startLocal: string; endLocal: string; day: string; pickupTime: string; pickupPoint: string | null; dropPoint: string | null; route: string | null;
  pax: number; status: AssignmentStatus; driverStatus: DriverDutyStatus; driverStatusAt: string | null; driverNote: string | null; confirmationNo: string | null;
  customerNotes: string | null; internalNotes: string | null; driverLabel: string | null; vehicleLabel: string | null; warnings?: string[];
}
export interface ActivityBookingRow extends Money {
  id: string; tripId: string; contractId: string | null; activityId: string | null; name: string; city: string | null; date: string; time: string | null;
  adults: number; children: number; status: OpsStatus; confirmationNo: string | null; vendorId: string | null; vendor: { id: string; name: string; phone: string } | null;
  customerNotes: string | null; internalNotes: string | null; cancelReason: string | null;
}
export interface Instalment { seq: number; label: string; dueDate: string; amount: number; paidAmount: number; status: string }

export interface TripWorkspace {
  trip: {
    id: string; tourName: string | null; destination: string; customer: string; customerId: string | null; phone: string; departure: string | null; returnDate: string | null;
    nights: number | null; pax: number; stage: TripStage; stageLabel: string; status: string; isInternational: boolean; notes: string;
    assignedOps: { id: string; name: string } | null; assignedOpsUserId: string | null; stageChangedAt: string | null; cancelReason: string | null;
  };
  readiness: { stage: TripStage; checks: Check[]; transitions: { to: TripStage; allowed: boolean; blockers: Check[]; warnings: Check[] }[] };
  money: { totalPayable: number | null; paid: number | null; balance: number | null; quotedCost?: number | null; grossMargin?: number | null; marginPct?: number | null; bookedCost?: number; bookedSell?: number };
  parties: { id: string; contractNumber: string; partyName: string | null; status: string; adults: number; children: number; infants: number; totalAmount: number; schedule: Instalment[]; payments: { total: number; paid: number; balance: number }; received: number; travellers: number }[];
  pickupPoints: { id: string; seq: number; name: string; address: string | null; landmark: string | null; pickupAt: string | null; pickupLocal: string | null; contactName: string | null; contactPhone: string | null; mapUrl: string | null; notes: string | null; travellers: number }[];
  travellers: { linkId: string; travellerId: string; name: string; role: string; phone: string | null; gender: string | null; dateOfBirth: string | null; contractId: string | null; partyName: string | null; pickupPointId: string | null; passportStatus: PassportStatus }[];
  hotels: HotelBookingRow[]; vehicles: VehicleDutyRow[]; activities: ActivityBookingRow[]; tickets: Ticket[];
  documents: { linkId: string; role: string | null; id: string; title: string; type: string; status: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; expiresAt: string | null }[];
  tasks: { id: string; title: string; priority: string; status: string; dueDate: string | null; assignedTo: string | null }[];
  timeline: { id: string; action: string; title: string | null; description: string; timestamp: string; userId: string | null; source: string }[];
}

export const tripsApi = {
  list:        (q: Partial<TripListQuery>) => api.get<Page<TripListItem>>('/v2/trips', q),
  get:         (id: string) => api.get<TripWorkspace>(`/v2/trips/${id}`),
  create:      (b: TripCreate) => api.post<TripWorkspace>('/v2/trips', b),
  update:      (id: string, b: TripUpdate) => api.put<TripWorkspace>(`/v2/trips/${id}`, b),
  stage:       (id: string, stage: TripStage, reason?: string | null) => api.post<TripWorkspace>(`/v2/trips/${id}/stage`, { stage, reason }),
  pickupPoints: (id: string, b: PickupPointsPut) => api.put<TripWorkspace>(`/v2/trips/${id}/pickup-points`, b),
  assign:      (id: string, b: TravellerAssignments) => api.put<TripWorkspace>(`/v2/trips/${id}/assignments`, b),

  addHotel:    (tripId: string, b: HotelBookingInput) => api.post<HotelBookingRow>(`/v2/ops/trips/${tripId}/hotel-bookings`, b),
  updateHotel: (id: string, b: HotelBookingUpdate) => api.put<HotelBookingRow>(`/v2/ops/hotel-bookings/${id}`, b),
  hotelStatus: (id: string, b: OpsStatusChange) => api.post<HotelBookingRow>(`/v2/ops/hotel-bookings/${id}/status`, b),
  addDuty:     (tripId: string, b: VehicleAssignmentInput) => api.post<VehicleDutyRow>(`/v2/ops/trips/${tripId}/vehicle-assignments`, b),
  updateDuty:  (id: string, b: VehicleAssignmentUpdate) => api.put<VehicleDutyRow>(`/v2/ops/vehicle-assignments/${id}`, b),
  dutyStatus:  (id: string, b: AssignmentStatusChange) => api.post<VehicleDutyRow>(`/v2/ops/vehicle-assignments/${id}/status`, b),
  conflicts:   (q: { vehicleId?: string; driverId?: string; startAt: string; endAt: string; excludeId?: string }) => api.get<{ resource: string; assignmentId: string; trip: string; startLocal: string; endLocal: string }[]>('/v2/ops/vehicle-assignments/conflicts', q),
  addActivity: (tripId: string, b: ActivityBookingInput) => api.post<ActivityBookingRow>(`/v2/ops/trips/${tripId}/activity-bookings`, b),
  updateActivity: (id: string, b: ActivityBookingUpdate) => api.put<ActivityBookingRow>(`/v2/ops/activity-bookings/${id}`, b),
  activityStatus: (id: string, b: OpsStatusChange) => api.post<ActivityBookingRow>(`/v2/ops/activity-bookings/${id}/status`, b),

  registerDocument: (b: { fileName: string; mimeType: string; sizeBytes: number; type: string; title?: string; links: { entityType: string; entityId: string; role?: string }[] }) =>
    api.post<{ document: { id: string }; upload: { url: string; method: 'PUT'; headers: Record<string, string> } }>('/v2/documents', b),
  completeDocument: (id: string) => api.post<{ id: string }>(`/v2/documents/${id}/complete`),
  downloadDocument: (id: string) => api.get<{ url: string; expiresAt: string }>(`/v2/documents/${id}/download`),
};
