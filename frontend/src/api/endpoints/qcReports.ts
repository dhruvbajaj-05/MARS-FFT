import { apiClient } from '@/api/client';
import type {
  Paginated,
  QCActiveOrdersResponse,
  QCActivePOsResponse,
  QCDepartment,
  QCNotification,
  QCOrderContext,
  QCReport,
  QCStatusValue,
  QCSummary,
} from '@/api/types';
import { postFormData } from '@/services/mediaUpload';

// Filters accepted by the list/search endpoint.
export interface QCListParams {
  department?: QCDepartment;
  customerId?: string;
  productId?: string;
  orderId?: string;
  submittedBy?: string;
  status?: QCStatusValue;
  severity?: string;
  machine?: string;
  mould?: string;
  defect?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// The centralized QC (Quality Management) module client. All defect reports flow through
// here; `department` selects the Moulding QC vs Assembly QC data source.
export const qcReportsApi = {
  // Multipart create (photos[]). Uses fetch (via postFormData) so RN sets the multipart
  // boundary correctly — axios in RN can omit it and hang the request.
  create: (form: FormData) =>
    postFormData<{ report: QCReport }>('/qc-reports', form).then((r) => r.report),

  list: (params: QCListParams = {}) =>
    apiClient.get<Paginated<QCReport>>('/qc-reports', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<{ report: QCReport }>(`/qc-reports/${id}`).then((r) => r.data.report),

  orderContext: (orderId: string, department: QCDepartment) =>
    apiClient
      .get<QCOrderContext>('/qc-reports/order-context', { params: { orderId, department } })
      .then((r) => r.data),

  // Item codes currently inside a department's ACTIVE QC tab (req #11).
  activeOrders: (department: QCDepartment) =>
    apiClient
      .get<QCActiveOrdersResponse>('/qc-reports/active-orders', { params: { department } })
      .then((r) => r.data.orders),

  // Item codes moved to ARCHIVED QC (after "Done Uploading QC Photos" / "QC Done").
  archivedOrders: (department: QCDepartment) =>
    apiClient
      .get<QCActiveOrdersResponse>('/qc-reports/archived-orders', { params: { department } })
      .then((r) => r.data.orders),

  // PO-level QC lists (Moulding QC works at PO level).
  activePOs: (department: QCDepartment) =>
    apiClient
      .get<QCActivePOsResponse>('/qc-reports/active-pos', { params: { department } })
      .then((r) => r.data.purchaseOrders),
  archivedPOs: (department: QCDepartment) =>
    apiClient
      .get<QCActivePOsResponse>('/qc-reports/archived-pos', { params: { department } })
      .then((r) => r.data.purchaseOrders),

  // "Done with Moulding QC for this PO" — archives the whole PO for the department.
  closePO: (purchaseOrderId: string, department: QCDepartment) =>
    apiClient
      .post<{ purchaseOrderId: string; department: QCDepartment; closedJobs: number; totalJobs: number }>(
        '/qc-reports/close-po',
        { purchaseOrderId, department }
      )
      .then((r) => r.data),

  // "Done Uploading QC Photos" — closes QC for one order + department.
  closeOrder: (orderId: string, department: QCDepartment) =>
    apiClient
      .post<{ orderId: string; department: QCDepartment; qcClosedDepartments: string[] }>(
        '/qc-reports/close-order',
        { orderId, department }
      )
      .then((r) => r.data),

  summary: (orderId: string, department: QCDepartment) =>
    apiClient
      .get<QCSummary>('/qc-reports/summary', { params: { orderId, department } })
      .then((r) => r.data),

  defectTypes: () =>
    apiClient.get<{ defectTypes: string[] }>('/qc-reports/defect-types').then((r) => r.data.defectTypes),

  addDefectType: (name: string) =>
    apiClient
      .post<{ defectTypes: string[] }>('/qc-reports/defect-types', { name })
      .then((r) => r.data.defectTypes),

  setStatus: (id: string, status: QCStatusValue, note?: string) =>
    apiClient
      .patch<{ report: QCReport }>(`/qc-reports/${id}/status`, { status, note })
      .then((r) => r.data.report),

  addComment: (id: string, text: string) =>
    apiClient
      .post<{ report: QCReport }>(`/qc-reports/${id}/comments`, { text })
      .then((r) => r.data.report),

  // Admin notifications.
  notifications: (params: { unread?: boolean; page?: number; limit?: number } = {}) =>
    apiClient
      .get<Paginated<QCNotification> & { unreadCount: number }>('/qc-notifications', { params })
      .then((r) => r.data),

  markRead: (id: string) =>
    apiClient.patch<{ id: string; isRead: boolean }>(`/qc-notifications/${id}/read`).then((r) => r.data),
};
