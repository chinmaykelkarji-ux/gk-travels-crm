import { api, type Page } from '@/lib/api';
import type {
  ActivityInput, DriverInput, HotelInput, ImportPreview, MasterListQuery, RateInput, RoomTypeInput, VehicleInput, VendorInput, VendorKind,
} from '@/shared/contracts/masters';
import type { ImportKind } from '@/shared/calc/importMapping';
import type { ComplianceReport } from '@/shared/calc/compliance';
import type { StayQuote } from '@/shared/calc/hotelRates';

type Ref = { id: string; name: string } | null;
export interface ActivityLogRow { id: string; action: string; description: string | null; timestamp: string; userId: string | null; source: string }

export interface Vendor {
  id: string; name: string; kind: VendorKind; companyName: string | null; contactPerson: string | null; phone: string; whatsapp: string | null; email: string | null;
  city: string | null; state: string | null; address: string | null; gstNumber: string | null; pan: string | null; destinations: string[]; paymentTerms: string | null;
  creditDays: number | null; bankDetails: Record<string, string | null> | null; notes: string | null; isActive: boolean; createdAt: string;
  counts: { hotels: number; vehicles: number; drivers: number; activities: number };
}
export interface VendorDetail extends Vendor {
  hotels: { id: string; name: string; city: string; isActive: boolean }[]; vehicles: { id: string; registrationNo: string; type: string; seats: number; isActive: boolean }[];
  drivers: { id: string; name: string; phone: string; isActive: boolean }[]; activities: { id: string; name: string; city: string; isActive: boolean }[]; activity: ActivityLogRow[];
}

export interface HotelSummary { id: string; name: string; city: string; state: string | null; category: string | null; vendor: Ref; phone: string | null; gstin: string | null; isActive: boolean; roomTypeCount: number }
export interface HotelRate { id: string; mealPlan: string; validFrom: string; validTo: string; label: string | null; costPerNight: number | null; sellPerNight: number | null; extraAdult: number | null; extraChild: number | null; gstRatePct: number | null }
export interface RoomType { id: string; name: string; maxAdults: number; maxChildren: number; mealPlans: string[]; notes: string | null; isActive: boolean; rates: HotelRate[] }
export interface Hotel extends Omit<HotelSummary, 'roomTypeCount'> {
  vendorId: string | null; address: string | null; email: string | null; checkInTime: string | null; checkOutTime: string | null; amenities: string[];
  notes: string | null; createdAt: string; canSeeRates: boolean; roomTypes: RoomType[]; activity?: ActivityLogRow[];
}

export interface Vehicle {
  id: string; registrationNo: string; type: string; make: string | null; model: string | null; seats: number; ownership: 'OWNED' | 'VENDOR';
  vendorId: string | null; vendor: Ref; defaultDriverId: string | null; defaultDriver: { id: string; name: string; phone: string } | null;
  insuranceExpiry: string | null; permitExpiry: string | null; fitnessExpiry: string | null; pucExpiry: string | null;
  compliance: ComplianceReport; notes: string | null; isActive: boolean; createdAt: string;
}
export interface Driver {
  id: string; name: string; phone: string; altPhone: string | null; vendorId: string | null; vendor: Ref; licenceNo: string | null; licenceExpiry: string | null;
  languages: string[]; address: string | null; emergencyContact: string | null; notes: string | null; isActive: boolean;
  appAccess: { userId: string; email: string; isActive: boolean } | null; compliance: ComplianceReport; createdAt: string;
}
export interface ActivityMaster {
  id: string; name: string; city: string; category: string | null; vendorId: string | null; vendor: Ref; durationMinutes: number | null; description: string | null;
  inclusions: string | null; minPax: number | null; maxPax: number | null; notes: string | null; isActive: boolean;
  costAdult: number | null; costChild: number | null; sellAdult: number | null; sellChild: number | null; canSeePrices: boolean; createdAt: string;
}

export type ListQ = Partial<MasterListQuery>;

export const mastersApi = {
  vendors:       (q: ListQ) => api.get<Page<Vendor>>('/v2/vendors', q),
  vendor:        (id: string) => api.get<VendorDetail>(`/v2/vendors/${id}`),
  createVendor:  (b: VendorInput) => api.post<Vendor>('/v2/vendors', b),
  updateVendor:  (id: string, b: Partial<VendorInput>) => api.put<Vendor>(`/v2/vendors/${id}`, b),

  hotels:        (q: ListQ) => api.get<Page<HotelSummary>>('/v2/hotels', q),
  hotel:         (id: string) => api.get<Hotel>(`/v2/hotels/${id}`),
  createHotel:   (b: HotelInput) => api.post<Hotel>('/v2/hotels', b),
  updateHotel:   (id: string, b: Partial<HotelInput>) => api.put<Hotel>(`/v2/hotels/${id}`, b),
  addRoomType:   (hotelId: string, b: RoomTypeInput) => api.post<Hotel>(`/v2/hotels/${hotelId}/room-types`, b),
  updateRoomType: (rtId: string, b: Partial<RoomTypeInput>) => api.put<Hotel>(`/v2/hotels/room-types/${rtId}`, b),
  addRate:       (rtId: string, b: RateInput) => api.post<Hotel>(`/v2/hotels/room-types/${rtId}/rates`, b),
  updateRate:    (rateId: string, b: RateInput) => api.put<Hotel>(`/v2/hotels/rates/${rateId}`, b),
  deleteRate:    (rateId: string) => api.delete<Hotel>(`/v2/hotels/rates/${rateId}`),
  quoteStay:     (hotelId: string, q: { roomTypeId: string; mealPlan: string; checkIn: string; checkOut: string; rooms: number }) => api.get<StayQuote>(`/v2/hotels/${hotelId}/quote`, q),

  vehicles:      (q: ListQ) => api.get<Page<Vehicle>>('/v2/vehicles', q),
  createVehicle: (b: VehicleInput) => api.post<Vehicle>('/v2/vehicles', b),
  updateVehicle: (id: string, b: Partial<VehicleInput>) => api.put<Vehicle>(`/v2/vehicles/${id}`, b),
  drivers:       (q: ListQ) => api.get<Page<Driver>>('/v2/drivers', q),
  createDriver:  (b: DriverInput) => api.post<Driver>('/v2/drivers', b),
  updateDriver:  (id: string, b: Partial<DriverInput>) => api.put<Driver>(`/v2/drivers/${id}`, b),
  compliance:    () => api.get<{ vehicles: Vehicle[]; drivers: Driver[]; warnDays: number }>('/v2/masters/compliance'),

  activities:    (q: ListQ) => api.get<Page<ActivityMaster>>('/v2/activities', q),
  createActivity: (b: ActivityInput) => api.post<ActivityMaster>('/v2/activities', b),
  updateActivity: (id: string, b: Partial<ActivityInput>) => api.put<ActivityMaster>(`/v2/activities/${id}`, b),

  importPreview: (kind: ImportKind, csv: string) => api.post<ImportPreview>(`/v2/masters/import/${kind}/preview`, { csv }),
  importCommit:  (kind: ImportKind, csv: string, skipInvalid: boolean) => api.post<ImportPreview & { committed: number }>(`/v2/masters/import/${kind}/commit`, { csv, skipInvalid }),
};
