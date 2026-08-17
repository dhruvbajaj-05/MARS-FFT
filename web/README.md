# MARS FFT — Web Console

A **separate** web application (React + Vite + TypeScript) that consumes the **existing**
backend API. It does **not** modify the mobile Expo app or the backend — it is a new,
desktop-first face for the same data and business logic.

Current scope: **Admin** (login + dashboard + orders). More roles/pages can be added later.

## Run it

```bash
cd web
npm install          # first time only
npm run dev          # start the dev server → http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build locally
```

By default the app talks to the **production** backend
(`https://mars-fft-production.up.railway.app`). To point at a local backend, create a
`web/.env` file (copy `.env.example`) and set:

```
VITE_API_ORIGIN=http://localhost:5000
```

Sign in with an **admin** account. Non-admin roles are told to use the mobile app (the web
console is admin-only for now).

## How it's put together

```
src/
  config/env.ts          API origin + localStorage key (reads VITE_API_ORIGIN)
  api/
    client.ts            single axios instance: attaches Bearer token, clears session on 401
    types.ts             API DTOs (roles, auth, admin analytics) — mirror backend shapes
    auth.ts              /auth/login, /auth/me, /auth/logout wrappers
    admin.ts             /admin/* analytics wrappers
  store/authStore.ts     zustand session store; token persisted to localStorage
  lib/queryClient.ts     react-query client (server-state caching)
  routes/ProtectedRoute  redirects unauthenticated / wrong-role users to /login
  pages/
    LoginPage.tsx        email+password sign-in, routes admins to the dashboard
    admin/AdminLayout     sidebar shell (the desktop look)
    admin/DashboardPage   KPI cards + department table from /admin analytics
    admin/OrdersPage      filterable, paginated /admin/orders table
  index.css              all styling (light desktop console theme; design tokens)
```

The auth + API layer is intentionally the same contract the mobile app uses (Bearer JWT,
`/api/v1` base), so both clients stay in lock-step with the backend.
