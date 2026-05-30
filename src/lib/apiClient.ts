import axios, { type AxiosError } from 'axios';

const TOKEN_KEY = 'gkcrm_token';

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 8000,  // 8 s — fast enough to feel responsive, enough for slow DB queries
});

// ── Request: attach JWT on every call ──────────────────────────
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: surface errors to the user ──────────────────────
//
// Mutation failures (POST/PUT/DELETE) were previously fire-and-forget
// — they updated Zustand optimistically, the API call silently 401'd,
// and the database never received the change. On refresh everything
// was gone. We now:
//   • Re-throw so the store / component can handle it.
//   • Clear the stored token on 401 so the next navigation triggers
//     a fresh /auth/setup call from AuthContext.
//   • Never redirect to /login (login screen has been removed).
apiClient.interceptors.response.use(
  res => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      // Token expired or invalid — clear it. AuthContext will re-bootstrap
      // on the next page load / navigation via its useEffect.
      localStorage.removeItem(TOKEN_KEY);
      console.warn('[apiClient] 401 received — token cleared, will re-authenticate on next request');
    }
    return Promise.reject(err);
  }
);

export const tokenStorage = {
  get:   ()           => localStorage.getItem(TOKEN_KEY),
  set:   (t: string)  => localStorage.setItem(TOKEN_KEY, t),
  clear: ()           => localStorage.removeItem(TOKEN_KEY),
};

export default apiClient;
