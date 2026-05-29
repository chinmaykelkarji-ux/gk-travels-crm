// ============================================================
// GK TRAVELS CRM — Trip Query & Mutation Hooks
// ============================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tripService, type CreateTripInput, type UpdateTripInput } from '@/backend/services/trip.service';
import { tripRepository } from '@/backend/repositories/trip.repository';
import { useAuth } from '@/backend/auth/AuthContext';
import { Q } from './queryKeys';
import { shouldRetry, STALE_TIME } from './apiError';
import type { TripFilters, TripSort } from '@/backend/repositories/trip.repository';
import type { TripStatus, DbLead } from '@/backend/supabase/database.types';

// ─── useTrips — paginated list ────────────────────────────────

export function useTrips(
  filters?:    TripFilters,
  sort?:       TripSort,
  pagination?: { page: number; limit: number },
) {
  const { user } = useAuth();
  const orgId    = user?.orgId ?? '';

  return useQuery({
    queryKey: Q.trips.list(orgId, { ...filters, ...sort, ...pagination }),
    queryFn:  () => tripService.list(orgId, filters, sort, pagination),
    enabled:  Boolean(orgId),
    staleTime: STALE_TIME.short,
    retry:    shouldRetry,
  });
}

// ─── useTrip — single trip detail ────────────────────────────

export function useTrip(id: string | undefined) {
  const { user } = useAuth();
  const orgId    = user?.orgId ?? '';

  return useQuery({
    queryKey: Q.trips.detail(orgId, id ?? ''),
    queryFn:  () => tripService.get(orgId, id!),
    enabled:  Boolean(orgId && id),
    staleTime: STALE_TIME.short,
    retry:    shouldRetry,
  });
}

// ─── useDepartingTrips ────────────────────────────────────────

export function useDepartingTrips(days = 7) {
  const { user } = useAuth();
  const orgId    = user?.orgId ?? '';

  return useQuery({
    queryKey: Q.trips.departing(orgId, days),
    // tripRepository is imported directly — never access private members via brackets
    queryFn:  () => tripRepository.findDepartingWithin(orgId, days),
    enabled:  Boolean(orgId),
    staleTime: STALE_TIME.realtime,
    retry:    shouldRetry,
  });
}

// ─── useCreateTrip ────────────────────────────────────────────

export function useCreateTrip() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (input: CreateTripInput) =>
      tripService.create(orgId, input, user?.id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: Q.trips.all(orgId) });
      queryClient.invalidateQueries({ queryKey: Q.finance.portfolio(orgId) });
    },
  });
}

// ─── useUpdateTrip ────────────────────────────────────────────

export function useUpdateTrip(tripId: string) {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (input: UpdateTripInput) =>
      tripService.update(orgId, tripId, input, user?.id ?? ''),
    onSuccess: (updated) => {
      queryClient.setQueryData(Q.trips.detail(orgId, tripId), updated);
      queryClient.invalidateQueries({ queryKey: Q.trips.list(orgId) });
    },
  });
}

// ─── useSetTripStatus ─────────────────────────────────────────

export function useSetTripStatus(tripId: string) {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (status: TripStatus) =>
      tripService.setStatus(orgId, tripId, status, user?.id ?? ''),
    onSuccess: (result) => {
      if (result.ok && result.trip) {
        queryClient.setQueryData(Q.trips.detail(orgId, tripId), result.trip);
        queryClient.invalidateQueries({ queryKey: Q.trips.list(orgId) });
      }
    },
  });
}

// ─── useDeleteTrip ────────────────────────────────────────────

export function useDeleteTrip() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (id: string) => tripService.delete(orgId, id, user?.id ?? ''),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: Q.trips.detail(orgId, id) });
      queryClient.invalidateQueries({ queryKey: Q.trips.all(orgId) });
    },
  });
}

// ─── useConvertLead ───────────────────────────────────────────

export function useConvertLead() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (lead: DbLead) =>
      tripService.convertFromLead(orgId, lead, user?.id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: Q.trips.all(orgId) });
      queryClient.invalidateQueries({ queryKey: Q.leads.all(orgId) });
    },
  });
}
