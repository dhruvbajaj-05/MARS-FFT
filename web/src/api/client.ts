import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { config } from '@/config/env';
import { useAuthStore } from '@/store/authStore';

// The single axios instance — ALL network calls go through this (same rule as mobile).
export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

// Request interceptor: attach the bearer token from the in-memory auth store.
apiClient.interceptors.request.use((req: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) {
    req.headers.set('Authorization', `Bearer ${token}`);
  }
  return req;
});

// Response interceptor: on a 401 for any non-auth call, the session is dead (there is no
// refresh token on the backend), so we clear it and let the router redirect to /login.
// This is a simpler version of the mobile handler — no silent retry, matching the backend's
// single-token model.
apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url ?? '';
    if (status === 401 && !url.includes('/auth/')) {
      useAuthStore.getState().clear();
    }
    return Promise.reject(error);
  },
);

// Pull a human-readable message out of the backend's { error, message } error body.
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { message?: string } | undefined;
    return body?.message ?? error.message ?? fallback;
  }
  return fallback;
}
