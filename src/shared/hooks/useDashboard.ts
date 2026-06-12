import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '@/lib/apiClient';
import type { DashboardData } from '@/shared/types/operations';

const REFRESH_INTERVAL_MS = 5 * 60_000;

interface UseDashboardResult {
  data:    DashboardData | null;
  loading: boolean;
  error:   string | null;
  refetch: () => void;
}

// ── useDashboard ──────────────────────────────────────────────────
// Fetches /api/dashboard/today on mount and refreshes every 5 minutes.

export function useDashboard(): UseDashboardResult {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<DashboardData>('/dashboard/today');
      if (mountedRef.current) {
        setData(res.data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchData();

    const interval = setInterval(() => void fetchData(), REFRESH_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  return { data, loading, error, refetch: () => void fetchData() };
}
