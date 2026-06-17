import Constants from 'expo-constants';

// Runtime configuration. The API origin is sourced from app.json `extra.apiBaseUrl`
// so it can differ per environment (LAN IP for a device, tunnel for remote, prod URL).
//
// On a physical device or Android emulator, `localhost` will NOT reach your machine —
// set this to your computer's LAN IP (e.g. http://192.168.1.20:5000) in app.json,
// or via an EAS build profile, before running on hardware.
type Extra = { apiBaseUrl?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const API_ORIGIN = extra.apiBaseUrl ?? 'http://localhost:5000';

export const config = {
  // Origin only (no /api/v1) — used both for API calls and for resolving relative
  // media URLs returned by the backend (see utils/mediaUrl.ts, Gap #2).
  apiOrigin: API_ORIGIN,
  apiBaseUrl: `${API_ORIGIN}/api/v1`,

  // Session: proactively refresh the JWT when it is within this window of expiring.
  // (Backend default token life is 7d; there is no refresh token, so once expired the
  // user must log in again — Gap #1, frontend-only handling.)
  refreshBeforeMs: 24 * 60 * 60 * 1000, // 24h

  // Client-side upload limits — mirror the backend so we fail fast before a round-trip.
  upload: {
    maxImageBytes: 5 * 1024 * 1024,
    maxDocBytes: 10 * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedDocTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    maxFilesPerRecord: 10,
  },
} as const;
