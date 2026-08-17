import { apiClient } from '@/api/client';
import type {
  AdminAssemblyRecord,
  AdminDashboard,
  AdminDispatchRecord,
  AdminMouldingRecord,
  AdminOrderRow,
  AdminQCRecord,
  DepartmentSummary,
  Paginated,
  ProductionSummary,
  RejectionAnalytics,
} from '@/api/types';

export interface AdminOrderParams {
  status?: 'Active' | 'Completed' | 'Archived';
  page?: number;
  limit?: number;
}

// Records are scoped to one item-code job (orderId). Same contract as the mobile adminApi.
export interface AdminRecordParams {
  orderId?: string;
  shift?: 'A' | 'B' | 'C';
  page?: number;
  limit?: number;
}

// Admin analytics endpoints (read-only, admin-role only on the backend). Subset of the
// mobile adminApi — the endpoints the current web pages consume.
export const adminApi = {
  dashboard: () => apiClient.get<AdminDashboard>('/admin/dashboard').then((r) => r.data),
  productionSummary: () =>
    apiClient.get<ProductionSummary>('/admin/production-summary').then((r) => r.data),
  rejections: () => apiClient.get<RejectionAnalytics>('/admin/rejections').then((r) => r.data),
  departments: () => apiClient.get<DepartmentSummary>('/admin/departments').then((r) => r.data),
  orders: (params: AdminOrderParams = {}) =>
    apiClient.get<Paginated<AdminOrderRow>>('/admin/orders', { params }).then((r) => r.data),

  // Per-department production records for one item-code job.
  mouldingRecords: (params: AdminRecordParams = {}) =>
    apiClient
      .get<Paginated<AdminMouldingRecord>>('/admin/records/moulding', { params })
      .then((r) => r.data),
  assemblyRecords: (params: AdminRecordParams = {}) =>
    apiClient
      .get<Paginated<AdminAssemblyRecord>>('/admin/records/assembly', { params })
      .then((r) => r.data),
  qcRecords: (params: AdminRecordParams = {}) =>
    apiClient.get<Paginated<AdminQCRecord>>('/admin/records/qc', { params }).then((r) => r.data),
  dispatchRecords: (params: AdminRecordParams = {}) =>
    apiClient
      .get<Paginated<AdminDispatchRecord>>('/admin/records/dispatch', { params })
      .then((r) => r.data),
};
