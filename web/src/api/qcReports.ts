import { apiClient } from '@/api/client';
import type { Paginated, QCDepartment, QCReport, QCStatusValue } from '@/api/types';

export interface QCListParams {
  department?: QCDepartment;
  status?: QCStatusValue;
  severity?: string;
  customerId?: string;
  orderId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Centralized QC (Quality Management) reports. Admin is a viewer (reads everything) and a
// case handler (may open/close a case + comment) — but NOT an author, so no create here.
// Mirrors the read/case subset of the mobile qcReportsApi.
export const qcReportsApi = {
  list: (params: QCListParams = {}) =>
    apiClient.get<Paginated<QCReport>>('/qc-reports', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<{ report: QCReport }>(`/qc-reports/${id}`).then((r) => r.data.report),

  setStatus: (id: string, status: QCStatusValue, note?: string) =>
    apiClient
      .patch<{ report: QCReport }>(`/qc-reports/${id}/status`, { status, note })
      .then((r) => r.data.report),

  addComment: (id: string, text: string) =>
    apiClient
      .post<{ report: QCReport }>(`/qc-reports/${id}/comments`, { text })
      .then((r) => r.data.report),
};
