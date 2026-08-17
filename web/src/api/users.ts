import { apiClient } from '@/api/client';
import type { ManagedUser, Paginated, Role } from '@/api/types';

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
export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
  customerId?: string;
  password?: string;
}

// Admin user management — create engineers/customers, edit, delete. Mirrors mobile usersApi.
export const usersApi = {
  list: (params: UserListParams = {}) =>
    apiClient.get<Paginated<ManagedUser>>('/users', { params }).then((r) => r.data),
  create: (input: CreateUserInput) =>
    apiClient.post<{ user: ManagedUser }>('/users', input).then((r) => r.data.user),
  update: (id: string, input: UpdateUserInput) =>
    apiClient.patch<{ user: ManagedUser }>(`/users/${id}`, input).then((r) => r.data.user),
  remove: (id: string) =>
    apiClient.delete<{ id: string; deleted: boolean }>(`/users/${id}`).then((r) => r.data),
};
