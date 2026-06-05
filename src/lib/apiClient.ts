// ============================================================
// GK TRAVELS CRM — Axios API Client
//
// Uses withCredentials: true so the browser automatically attaches
// the HttpOnly session cookie on every request.
// No token is ever stored in localStorage or accessible from JS.
// ============================================================

import axios, { type AxiosError } from 'axios';

export const apiClient = axios.create({
  baseURL:         '/api',
  withCredentials: true,   // always send the HttpOnly session cookie
  headers:         { 'Content-Type': 'application/json' },
  timeout:         15_000, // 15 s — serverless functions can be slow on cold start
});

// ── Response interceptor ───────────────────────────────────────
// 401 on a data/action endpoint → session expired → redirect to /login.
//
// Do NOT redirect for auth endpoints (/api/auth/*) — those 401s are
// handled locally (e.g. the initial /me check when the user has no session
// yet, or a failed login attempt). Redirecting there would cause an
// infinite reload loop.

apiClient.interceptors.response.use(
  res => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      const url            = err.config?.url ?? '';
      const isAuthEndpoint = url.startsWith('/auth/') || url.includes('/auth/');

      if (!isAuthEndpoint && !window.location.pathname.startsWith('/login')) {
        // Session expired mid-use — hard redirect so the cookie is re-issued
        // after login and all in-flight requests are cleanly abandoned.
        console.warn('[api] Session expired — redirecting to /login');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export default apiClient;
