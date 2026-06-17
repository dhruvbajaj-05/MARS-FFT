import { create } from 'zustand';

import type { AuthUser } from '@/api/types';

export type AuthStatus = 'loading' | 'authed' | 'unauthed';

interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: AuthUser | null;
  // Setters — persistence/side-effects live in services/session.ts, not here.
  setSession: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  setToken: (token: string) => void;
  setStatus: (status: AuthStatus) => void;
  clear: () => void;
}

// Auth is *client* session state → Zustand. The token is mirrored here in memory so
// the axios request interceptor can read it synchronously without hitting SecureStore
// on every call.
export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  token: null,
  user: null,
  setSession: (token, user) => set({ token, user, status: 'authed' }),
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setStatus: (status) => set({ status }),
  clear: () => set({ token: null, user: null, status: 'unauthed' }),
}));
