// ============================================================
// GK TRAVELS CRM — Axios API Client
//
// Uses withCredentials: true so the browser automatically attaches
// the HttpOnly `gkcrm_session` cookie on every request.
// No token is ever stored in localStorage or accessible from JS.
// ============================================================

import axios, { type AxiosError } from 'axios';

export const apiClient = axios.create({
  baseURL:         '/api',
  withCredentials: true,   // always send the HttpOnly session cookie
  headers:         { 'Content-Type': 'application/json' },
  timeout:         8000,   // 8 s — fast enough to feel responsive
});

// ── Response interceptor ───────────────────────────────────────
// 401 → session expired or not authenticated → redirect to /login
// All other errors propagate so callers can handle them.

apiClient.interceptors.response.use(
  res => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      // Avoid redirect loop if already on the login page
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default apiClient;
