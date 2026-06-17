import { apiClient } from '@/api/client';
import type { ManagedUser, Paginated } from '@/api/types';
import type { Role } from '@/types/roles';

export interface UserListParams {
  role?: Role;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  customerId?: string;
}

export const usersApi = {
  list: (params: UserListParams = {}) =>
    apiClient.get<Paginated<ManagedUser>>('/users', { params }).then((r) => r.data),
  get: (id: string) =>
    apiClient.get<{ user: ManagedUser }>(`/users/${id}`).then((r) => r.data.user),
  create: (input: CreateUserInput) =>
    apiClient.post<{ user: ManagedUser }>('/users', input).then((r) => r.data.user),
  deactivate: (id: string) =>
    apiClient.post<{ user: ManagedUser }>(`/users/${id}/deactivate`).then((r) => r.data.user),
  reactivate: (id: string) =>
    apiClient.post<{ user: ManagedUser }>(`/users/${id}/reactivate`).then((r) => r.data.user),
};
