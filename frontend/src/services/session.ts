import { authApi } from '@/api/endpoints/auth';
import { registerUnauthorizedHandler } from '@/api/client';
import type { AuthUser } from '@/api/types';
import { config } from '@/config/env';
import { useAuthStore } from '@/store/authStore';
import { isTokenExpired, tokenExpiryMs } from '@/utils/jwt';
import { clearToken, getToken, saveToken } from './secureStore';

// Orchestrates the full session lifecycle: login, secure persistence, auto-login on
// launch, proactive refresh, 401 recovery, and logout. (Gap #1: frontend-only — once
// the JWT actually expires the user must re-authenticate; we refresh proactively
// while it is still valid to keep long sessions seamless.)

let queryCacheClear: (() => void) | null = null;
export function registerCacheClear(fn: () => void) {
  queryCacheClear = fn;
}

async function persist(token: string, user: AuthUser) {
  await saveToken(token);
  useAuthStore.getState().setSession(token, user);
}

// LOGIN — exchange credentials, persist, hydrate the store.
export async function login(email: string, password: string): Promise<AuthUser> {
  const { token, user } = await authApi.login(email, password);
  await persist(token, user);
  return user;
}

// LOGOUT — best-effort server revoke, then wipe local state + caches.
export async function logout(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // Even if the server call fails (offline/expired), we still clear locally.
  }
  await clearToken();
  queryCacheClear?.();
  useAuthStore.getState().clear();
}

// REFRESH — issue a fresh token (only works while the current one is still valid).
async function refreshSession(): Promise<string | null> {
  try {
    const { token, user } = await authApi.refresh();
    await persist(token, user);
    return token;
  } catch {
    return null;
  }
}

// 401 RECOVERY (wired into the axios interceptor): try one refresh; on failure, log
// the user out cleanly so the navigator returns to the login screen.
registerUnauthorizedHandler(async () => {
  const newToken = await refreshSession();
  if (!newToken) await logout();
  return newToken;
});

// AUTO-LOGIN — called once at app launch. Restores the token from secure storage,
// validates it against /auth/me, and proactively refreshes if near expiry.
export async function restoreSession(): Promise<void> {
  const { setStatus, setSession, setToken, clear } = useAuthStore.getState();
  try {
    const token = await getToken();
    if (!token || isTokenExpired(token)) {
      clear();
      return;
    }

    // Make the token available to the interceptor before the validating call.
    setToken(token);

    // Proactively refresh when close to expiry to extend the session.
    const expMs = tokenExpiryMs(token);
    if (expMs && expMs - Date.now() < config.refreshBeforeMs) {
      const refreshed = await refreshSession();
      if (refreshed) {
        setStatus('authed');
        return;
      }
    }

    // Validate the (still valid) token and hydrate the profile.
    const user = await authApi.me();
    setSession(token, user);
  } catch {
    await clearToken();
    clear();
  }
}
