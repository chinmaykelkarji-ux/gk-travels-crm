import { api } from '@/lib/api';
import type { DriverDutyStatus } from '@/shared/calc/operations';
import type { DriverStatusChange } from '@/shared/contracts/driver';

export interface DriverDuty {
  id: string; tripId: string; tripLabel: string; startLocal: string; endLocal: string; isToday: boolean;
  pickupPoint: string | null; dropPoint: string | null; route: string | null; pax: number; vehicle: string | null; instructions: string | null;
  status: string; driverStatus: DriverDutyStatus; driverStatusLabel: string; driverStatusAt: string | null; driverNote: string | null;
  groupContact: { name: string; phone: string | null };
  pickupPoints: { name: string; time: string | null; landmark: string | null; address: string | null; mapUrl: string | null; contactName: string | null; contactPhone: string | null; passengers: string[] }[];
  unassignedPassengers: number;
}
export interface DriverDutiesView { driver: { name: string }; officePhone: string | null; duties: DriverDuty[] }

export const driverApi = {
  duties: (range: 'current' | 'past') => api.get<DriverDutiesView>('/v2/driver/duties', { range }),
  update: (id: string, b: DriverStatusChange) => api.post<DriverDutiesView>(`/v2/driver/duties/${id}/status`, b),
};
