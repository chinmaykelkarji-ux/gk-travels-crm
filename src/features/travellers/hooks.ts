import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { travellersApi } from './api';
import type { TravellerCreate, TravellerUpdate, TravellerListQuery, TripTravellersPut } from '@/shared/contracts/travellers';
import { customerKeys } from '@/features/customers/hooks';
import { useStore } from '@/store';

export const travellerKeys = {
  all:    ['travellers'] as const,
  list:   (q: Partial<TravellerListQuery>) => ['travellers', 'list', q] as const,
  detail: (id: string) => ['travellers', 'detail', id] as const,
  alerts: (days: number) => ['travellers', 'alerts', days] as const,
  trip:   (tripId: string) => ['travellers', 'trip', tripId] as const,
};

export function useTravellerList(q: Partial<TravellerListQuery>, enabled = true) {
  return useQuery({ queryKey: travellerKeys.list(q), queryFn: () => travellersApi.list(q), placeholderData: keepPreviousData, enabled });
}
export function useTraveller(id: string | undefined) {
  return useQuery({ queryKey: travellerKeys.detail(id ?? ''), queryFn: () => travellersApi.get(id as string), enabled: !!id });
}
export function usePassportAlerts(days = 180, enabled = true) {
  return useQuery({ queryKey: travellerKeys.alerts(days), queryFn: () => travellersApi.alerts(days), enabled });
}
export function useTripTravellers(tripId: string | undefined) {
  return useQuery({ queryKey: travellerKeys.trip(tripId ?? ''), queryFn: () => travellersApi.tripTravellers(tripId as string), enabled: !!tripId });
}

function useInvalidate() {
  const qc = useQueryClient();
  const fetchAll = useStore(s => s.fetchAll);
  return () => {
    void qc.invalidateQueries({ queryKey: travellerKeys.all });
    void qc.invalidateQueries({ queryKey: customerKeys.all });
    void fetchAll(); // legacy screens read passengers from the bootstrap
  };
}

export function useCreateTraveller() {
  const done = useInvalidate();
  return useMutation({ mutationFn: (body: TravellerCreate) => travellersApi.create(body), onSuccess: done });
}
export function useUpdateTraveller(id: string) {
  const done = useInvalidate();
  return useMutation({ mutationFn: (body: TravellerUpdate) => travellersApi.update(id, body), onSuccess: done });
}
export function useDeleteTraveller() {
  const done = useInvalidate();
  return useMutation({ mutationFn: (id: string) => travellersApi.remove(id), onSuccess: done });
}
export function useSetTripTravellers(tripId: string) {
  const done = useInvalidate();
  return useMutation({ mutationFn: (body: TripTravellersPut) => travellersApi.setTripTravellers(tripId, body), onSuccess: done });
}
