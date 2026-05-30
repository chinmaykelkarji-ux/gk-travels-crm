import axios from 'axios';

const TOKEN_KEY = 'gkcrm_token';

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach JWT on every request
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear token and redirect to login
apiClient.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const tokenStorage = {
  get:    ()           => localStorage.getItem(TOKEN_KEY),
  set:    (t: string)  => localStorage.setItem(TOKEN_KEY, t),
  clear:  ()           => localStorage.removeItem(TOKEN_KEY),
};

export default apiClient;
