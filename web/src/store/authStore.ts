import { create } from 'zustand';

import { config } from '@/config/env';
import type { AuthUser } from '@/api/types';

// Mirrors the mobile authStore: session state lives here in memory so the axios request
// interceptor can read the token synchronously. Difference for web: we also persist the
// token to localStorage so a page refresh keeps you logged in (mobile uses SecureStore).

export type AuthStatus = 'loading' | 'authed' | 'unauthed';

interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  setStatus: (status: AuthStatus) => void;
  clear: () => void;
}

// Read any previously stored token so a refresh does not bounce the user to /login while
// we re-validate it via /auth/me (see App bootstrap).
const initialToken =
  typeof localStorage !== 'undefined' ? localStorage.getItem(config.tokenStorageKey) : null;

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  token: initialToken,
  user: null,
  setSession: (token, user) => {
    localStorage.setItem(config.tokenStorageKey, token);
    set({ token, user, status: 'authed' });
  },
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  clear: () => {
    localStorage.removeItem(config.tokenStorageKey);
    set({ token: null, user: null, status: 'unauthed' });
  },
}));
