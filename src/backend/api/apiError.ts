// ============================================================
// GK TRAVELS CRM — API Error Handler
//
// Centralised error normalisation for TanStack Query.
// Converts any thrown error into a consistent ApiError shape.
// ============================================================

export interface ApiError {
  message:  string;
  code?:    string;
  status?:  number;
  original?: unknown;
}

export function normalizeError(err: unknown): ApiError {
  if (err instanceof Error) {
    return {
      message:  err.message,
      original: err,
    };
  }
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    return {
      message:  typeof e.message === 'string' ? e.message : 'Unknown error',
      code:     typeof e.code    === 'string' ? e.code    : undefined,
      status:   typeof e.status  === 'number' ? e.status  : undefined,
      original: err,
    };
  }
  return { message: String(err), original: err };
}

// ─── Retry config for TanStack Query ─────────────────────────
// Don't retry on 4xx errors (client mistakes) — only on network errors.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const err = error as Record<string, unknown> | null;
  const status = typeof err?.['status'] === 'number' ? err['status'] : null;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 3;
}

// ─── Default stale times ─────────────────────────────────────
export const STALE_TIME = {
  realtime:  0,              // always refetch (live data)
  short:     30_000,         // 30 seconds (trip list)
  medium:    5 * 60_000,     // 5 minutes (customer list)
  long:      30 * 60_000,    // 30 minutes (static config)
} as const;
