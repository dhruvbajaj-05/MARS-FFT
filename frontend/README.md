# FFT Manufacturing — Mobile App (Phase 10)

React Native (Expo + TypeScript) client for the FFT Manufacturing backend. Single
codebase for Android phones, iPhones and tablets, with light/dark mode and role-based
navigation (Admin, Moulding/Assembly/QC/Dispatch Engineers, Customer).

## Stack
Expo · TypeScript · React Navigation · TanStack Query · Axios · React Hook Form · Zod ·
Zustand · Expo Secure Store · Expo Image Picker.

## Getting started
```bash
npm install
npm start          # then press a (Android) / i (iOS), or scan the QR in Expo Go
```

### Point the app at your backend
The API origin comes from `app.json → expo.extra.apiBaseUrl`.
- **Simulator/emulator on the same machine:** `http://localhost:5000` may work on iOS sim;
  on Android emulator use `http://10.0.2.2:5000`.
- **Physical device:** use your computer's LAN IP, e.g. `http://192.168.1.20:5000`.

### Backend prerequisites
- Set **`PUBLIC_BASE_URL`** on the backend so media URLs are absolute and load on devices
  (the app also has a relative-URL fallback resolver — see `src/utils/mediaUrl.ts`).

## Architecture
```
src/
  api/         axios client + interceptors, typed endpoints, query keys, DTOs
  services/    session/auth, secure store, media upload, error mapping, notifications (stub)
  store/       zustand: auth session, theme
  hooks/       react-query hooks, responsive helper
  theme/       light/dark tokens + ThemeProvider
  components/   Card, StatusBadge, ProgressBar, KPI, ImageGallery, QueryBoundary, states…
  navigation/  RootNavigator (role switch), per-role tab navigators, linking (push-ready)
  screens/     auth · admin · engineer · customer · shared
  features/    feature modules (e.g. engineer department descriptor)
  utils/       jwt, mediaUrl, formatters, statusTone
  types/       roles, navigation params
```

### Key behaviors
- **Auth:** JWT stored in Expo Secure Store; auto-login validates via `/auth/me`; proactive
  refresh near expiry; 401 → one refresh attempt → clean logout. (No refresh token on the
  backend, so a fully-expired session requires re-login.)
- **RBAC:** only the navigator for the authenticated role is mounted — other roles' screens
  are never registered. Backend remains the source of truth (401/403 handled globally).
- **Data:** all server state via TanStack Query (retry + backoff, offline cache, reconnect
  refetch). No raw `fetch`. Uniform Loading/Empty/Error/Retry via `<QueryBoundary>`.
- **Uploads:** multipart built per backend contract — field `image` (moulding),
  `photos[]` (assembly/qc/dispatch), `documents[]` (dispatch); QC `defects` sent as a
  JSON string.

## Build status
**This pass delivers the full foundation** (config, theme, API/types, session/auth,
navigation shell, shared components) plus working **Login**, **auto-login**, **Admin** and
**Customer** dashboards, and a client-composed **Engineer** dashboard. Remaining role
screens are stubbed with `ComingSoon` and wired in subsequent passes (see project plan).
