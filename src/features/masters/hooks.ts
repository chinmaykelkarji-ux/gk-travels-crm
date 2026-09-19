import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mastersApi, type ListQ } from './api';

export const masterKeys = {
  all:        ['masters'] as const,
  vendors:    (q: ListQ) => ['masters', 'vendors', q] as const,
  vendor:     (id: string) => ['masters', 'vendor', id] as const,
  hotels:     (q: ListQ) => ['masters', 'hotels', q] as const,
  hotel:      (id: string) => ['masters', 'hotel', id] as const,
  vehicles:   (q: ListQ) => ['masters', 'vehicles', q] as const,
  drivers:    (q: ListQ) => ['masters', 'drivers', q] as const,
  activities: (q: ListQ) => ['masters', 'activities', q] as const,
  compliance: ['masters', 'compliance'] as const,
};

const listOpts = { placeholderData: keepPreviousData } as const;
export const useVendors    = (q: ListQ, enabled = true) => useQuery({ queryKey: masterKeys.vendors(q), queryFn: () => mastersApi.vendors(q), ...listOpts, enabled });
export const useVendor     = (id?: string) => useQuery({ queryKey: masterKeys.vendor(id ?? ''), queryFn: () => mastersApi.vendor(id!), enabled: !!id });
export const useHotels     = (q: ListQ, enabled = true) => useQuery({ queryKey: masterKeys.hotels(q), queryFn: () => mastersApi.hotels(q), ...listOpts, enabled });
export const useHotel      = (id?: string) => useQuery({ queryKey: masterKeys.hotel(id ?? ''), queryFn: () => mastersApi.hotel(id!), enabled: !!id });
export const useVehicles   = (q: ListQ, enabled = true) => useQuery({ queryKey: masterKeys.vehicles(q), queryFn: () => mastersApi.vehicles(q), ...listOpts, enabled });
export const useDrivers    = (q: ListQ, enabled = true) => useQuery({ queryKey: masterKeys.drivers(q), queryFn: () => mastersApi.drivers(q), ...listOpts, enabled });
export const useActivities = (q: ListQ, enabled = true) => useQuery({ queryKey: masterKeys.activities(q), queryFn: () => mastersApi.activities(q), ...listOpts, enabled });
export const useCompliance = () => useQuery({ queryKey: masterKeys.compliance, queryFn: mastersApi.compliance });

/** Any master write: invalidate all master lists (they are small and cross-reference each other). */
export function useMasterMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { void qc.invalidateQueries({ queryKey: masterKeys.all }); } });
}
