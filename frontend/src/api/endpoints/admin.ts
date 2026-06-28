import { apiClient } from '@/api/client';
import type {
  AdminAssemblyRecord,
  AdminDashboard,
  AdminDispatchRecord,
  AdminMouldingRecord,
  AdminOrderRow,
  AdminOrderTimeline,
  AdminQCRecord,
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

export interface AdminRecordParams {
  customerId?: string;
  productId?: string;
  orderId?: string;
  shift?: 'A' | 'B' | 'C';
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
  orderTimeline: (id: string) =>
    apiClient.get<AdminOrderTimeline>(`/admin/orders/${id}/timeline`).then((r) => r.data),
  mouldingRecords: (params: AdminRecordParams = {}) =>
    apiClient.get<Paginated<AdminMouldingRecord>>('/admin/records/moulding', { params }).then((r) => r.data),
  assemblyRecords: (params: AdminRecordParams = {}) =>
    apiClient.get<Paginated<AdminAssemblyRecord>>('/admin/records/assembly', { params }).then((r) => r.data),
  qcRecords: (params: AdminRecordParams = {}) =>
    apiClient.get<Paginated<AdminQCRecord>>('/admin/records/qc', { params }).then((r) => r.data),
  dispatchRecords: (params: AdminRecordParams = {}) =>
    apiClient.get<Paginated<AdminDispatchRecord>>('/admin/records/dispatch', { params }).then((r) => r.data),
};
