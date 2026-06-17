import { apiClient } from '@/api/client';
import type { LoginResponse, MeResponse } from '@/api/types';

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  me: () => apiClient.get<MeResponse>('/auth/me').then((r) => r.data.user),

  refresh: () => apiClient.post<LoginResponse>('/auth/refresh').then((r) => r.data),

  logout: () => apiClient.post('/auth/logout').then((r) => r.data),
};
