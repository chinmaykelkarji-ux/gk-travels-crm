import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/lib/apiClient';
import type { TripService } from '@/shared/types';

interface UseTripServicesResult {
  services: TripService[];
  loading:  boolean;
  error:    string | null;
  refetch:  () => Promise<void>;
}

export function useTripServices(tripId: string): UseTripServicesResult {
  const [services, setServices] = useState<TripService[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<TripService[]>('/trip-services', { params: { tripId } });
      setServices(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch services');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { void fetchServices(); }, [fetchServices]);

  return { services, loading, error, refetch: fetchServices };
}
