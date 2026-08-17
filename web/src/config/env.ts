// Runtime configuration. The API origin comes from the Vite env var VITE_API_ORIGIN
// (set in a .env file — see .env.example) and falls back to the production backend so
// the app works out of the box. This mirrors the mobile app's config/env.ts, which reads
// the same origin from app.json `extra.apiBaseUrl`.
const API_ORIGIN =
  (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, '') ??
  'https://mars-fft-production.up.railway.app';

export const config = {
  // Origin only (no /api/v1) — also used to resolve relative media URLs from the backend.
  apiOrigin: API_ORIGIN,
  apiBaseUrl: `${API_ORIGIN}/api/v1`,
  // localStorage key under which we persist the JWT (web equivalent of mobile SecureStore).
  tokenStorageKey: 'fft.web.token',
} as const;
