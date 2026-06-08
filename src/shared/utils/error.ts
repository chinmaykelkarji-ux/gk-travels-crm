// ============================================================
// Safe error-message extraction
//
// Production (Vercel) sometimes returns platform-level error bodies
// shaped like { error: { code, message } } — e.g. when a serverless
// function crashes or times out — instead of the Express API's
// { error: 'string' } shape. Any code that reaches into
// `err.response.data.error` and renders it directly can therefore
// receive an OBJECT, which crashes React with error #31
// ("Objects are not valid as a React child"). Always route
// extracted error values through this helper before storing them
// in render-bound state or passing them to toasts/alerts.
// ============================================================

export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Unexpected error';
}

/**
 * Extracts a human-readable message from an Axios-style error, falling back
 * through `response.data.error` (string OR `{code,message}` object),
 * `response.data.message`, the Error's own `.message`, then `fallback`.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === 'object') {
      const d = data as { error?: unknown; message?: unknown };
      if (typeof d.error === 'string') return d.error;
      if (d.error && typeof d.error === 'object') return getErrorMessage(d.error);
      if (typeof d.message === 'string') return d.message;
    }
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
