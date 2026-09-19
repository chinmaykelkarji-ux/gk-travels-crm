import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TripListQuery } from '@/shared/contracts/trips';
import { ticketKeys } from '@/features/tickets/hooks';
import { tripsApi } from './api';

export const tripKeys = {
  all:    ['trips'] as const,
  list:   (q: Partial<TripListQuery>) => ['trips', 'list', q] as const,
  detail: (id: string) => ['trips', 'detail', id] as const,
};

export const useTrips = (q: Partial<TripListQuery>) => useQuery({ queryKey: tripKeys.list(q), queryFn: () => tripsApi.list(q), placeholderData: keepPreviousData });
export const useTripWorkspace = (id?: string) => useQuery({ queryKey: tripKeys.detail(id ?? ''), queryFn: () => tripsApi.get(id!), enabled: !!id });

/** Any trip write: refresh the workspace (readiness, timeline and stage may all move) and the lists. */
export function useTripMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: tripKeys.all });
      void qc.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}
