import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { config } from '@/config/env';
import { useAuthStore } from '@/store/authStore';
import { normalizeError } from '@/services/apiError';

// The single Axios instance. ALL network calls go through this (no raw fetch).
export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

// ---- Request interceptor: attach the bearer token from the in-memory auth store.
apiClient.interceptors.request.use((req: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) {
    req.headers.set('Authorization', `Bearer ${token}`);
  }
  return req;
});

// ---- 401 handling. The session layer registers a handler that attempts a single
// refresh and, failing that, forces logout. Registered here to avoid an import cycle
// (client ⇄ session). Concurrent 401s share one in-flight recovery promise.
type UnauthorizedHandler = () => Promise<string | null>;
let onUnauthorized: UnauthorizedHandler | null = null;
let recovery: Promise<string | null> | null = null;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const isAuthCall = original?.url?.includes('/auth/');

    if (status === 401 && original && !original._retried && !isAuthCall && onUnauthorized) {
      original._retried = true;
      recovery = recovery ?? onUnauthorized().finally(() => (recovery = null));
      const newToken = await recovery;
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return apiClient(original);
      }
    }

    return Promise.reject(normalizeError(error));
  },
);
