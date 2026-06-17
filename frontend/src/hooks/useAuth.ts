import { useMutation } from '@tanstack/react-query';

import type { AuthUser } from '@/api/types';
import { login as loginService, logout as logoutService } from '@/services/session';
import { useAuthStore } from '@/store/authStore';

// Current authenticated user + role (from the in-memory session store).
export function useCurrentUser(): AuthUser | null {
  return useAuthStore((s) => s.user);
}

export function useAuthStatus() {
  return useAuthStore((s) => s.status);
}

// Login mutation — wraps the session service (persists token + hydrates store).
export function useLogin() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      loginService(input.email, input.password),
  });
}

// Logout mutation — revokes server-side, clears token + caches, returns to login.
export function useLogout() {
  return useMutation({ mutationFn: () => logoutService() });
}
