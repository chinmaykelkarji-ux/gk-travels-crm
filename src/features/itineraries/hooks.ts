import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/features/trips/hooks';
import { itinerariesApi } from './api';

export const itineraryKeys = {
  all:      ['itineraries'] as const,
  byTrip:   (tripId: string) => ['itineraries', 'trip', tripId] as const,
  customer: (id: string) => ['itineraries', 'customer', id] as const,
  list:     (search: string) => ['itineraries', 'list', search] as const,
};

export const useTripItinerary = (tripId: string) => useQuery({ queryKey: itineraryKeys.byTrip(tripId), queryFn: () => itinerariesApi.byTrip(tripId) });
export const useCustomerItinerary = (id?: string) => useQuery({ queryKey: itineraryKeys.customer(id ?? ''), queryFn: () => itinerariesApi.customer(id!), enabled: !!id });
export const useItineraryList = (search: string, enabled = true) => useQuery({ queryKey: itineraryKeys.list(search), queryFn: () => itinerariesApi.list(search), enabled });

/** Itinerary writes move the trip's readiness warnings too. */
export function useItineraryMutation<A, R>(tripId: string, fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: itineraryKeys.all });
      void qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
    },
  });
}
