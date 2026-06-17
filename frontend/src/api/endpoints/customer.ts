import { apiClient } from '@/api/client';
import type {
  CustomerDashboard,
  CustomerOrderDetails,
  CustomerOrderProgress,
  CustomerOrderRow,
  Paginated,
} from '@/api/types';

export const customerApi = {
  dashboard: () => apiClient.get<CustomerDashboard>('/customer/dashboard').then((r) => r.data),
  orders: (params: { page?: number; limit?: number } = {}) =>
    apiClient.get<Paginated<CustomerOrderRow>>('/customer/orders', { params }).then((r) => r.data),
  orderDetails: (id: string) =>
    apiClient.get<CustomerOrderDetails>(`/customer/orders/${id}`).then((r) => r.data),
  orderProgress: (id: string) =>
    apiClient.get<CustomerOrderProgress>(`/customer/orders/${id}/progress`).then((r) => r.data),
};
