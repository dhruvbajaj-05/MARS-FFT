import { apiClient } from '@/api/client';
import type {
  AdminDashboard,
  AdminOrderRow,
  CustomerAnalyticsRow,
  DepartmentSummary,
  Paginated,
  ProductionSummary,
  RejectionAnalytics,
  UserAnalytics,
} from '@/api/types';

export interface AdminOrderParams {
  customerId?: string;
  productId?: string;
  orderId?: string;
  orderCode?: string;
  status?: 'Active' | 'Completed' | 'Archived';
  page?: number;
  limit?: number;
}

export const adminApi = {
  dashboard: () => apiClient.get<AdminDashboard>('/admin/dashboard').then((r) => r.data),
  productionSummary: () =>
    apiClient.get<ProductionSummary>('/admin/production-summary').then((r) => r.data),
  rejections: () => apiClient.get<RejectionAnalytics>('/admin/rejections').then((r) => r.data),
  departments: () => apiClient.get<DepartmentSummary>('/admin/departments').then((r) => r.data),
  customers: (params: { page?: number; limit?: number } = {}) =>
    apiClient.get<Paginated<CustomerAnalyticsRow>>('/admin/customers', { params }).then((r) => r.data),
  users: () => apiClient.get<UserAnalytics>('/admin/users').then((r) => r.data),
  orders: (params: AdminOrderParams = {}) =>
    apiClient.get<Paginated<AdminOrderRow>>('/admin/orders', { params }).then((r) => r.data),
  delayedOrders: (params: AdminOrderParams = {}) =>
    apiClient
      .get<Paginated<AdminOrderRow> & { policy: { type: string; thresholdDays: number } }>(
        '/admin/orders/delayed',
        { params },
      )
      .then((r) => r.data),
};
