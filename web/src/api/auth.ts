import { apiClient } from '@/api/client';
import type { LoginResponse, MeResponse } from '@/api/types';

// Auth endpoint wrappers — identical contract to the mobile app's endpoints/auth.ts.
export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  me: () => apiClient.get<MeResponse>('/auth/me').then((r) => r.data.user),

  logout: () => apiClient.post('/auth/logout').then((r) => r.data),
};
