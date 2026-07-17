import { apiClient } from '@/api/client';
import type {
  Order,
  Paginated,
  POJob,
  POLineInput,
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderStatus,
} from '@/api/types';

export interface PurchaseOrderListParams {
  customerId?: string;
  status?: PurchaseOrderStatus;
  page?: number;
  limit?: number;
}

// The Purchase Order container (Company → PO → Item Code). Creating a PO spawns one
// independent Item Code production job (Order) per line on the backend.
export const purchaseOrdersApi = {
  list: (params: PurchaseOrderListParams = {}) =>
    apiClient.get<Paginated<PurchaseOrder>>('/purchase-orders', { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<PurchaseOrderDetail>(`/purchase-orders/${id}`).then((r) => r.data),

  create: (input: { customerId: string; lines: POLineInput[]; notes?: string }) =>
    apiClient
      .post<{ purchaseOrder: PurchaseOrder; jobs: Order[] }>('/purchase-orders', input)
      .then((r) => r.data),

  addLine: (id: string, line: POLineInput) =>
    apiClient.post<{ job: POJob }>(`/purchase-orders/${id}/lines`, line).then((r) => r.data.job),

  removeLine: (id: string, jobId: string) =>
    apiClient
      .delete<{ id: string; deleted: boolean }>(`/purchase-orders/${id}/lines/${jobId}`)
      .then((r) => r.data),

  update: (id: string, input: { notes?: string; status?: PurchaseOrderStatus }) =>
    apiClient
      .patch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${id}`, input)
      .then((r) => r.data.purchaseOrder),

  remove: (id: string) =>
    apiClient.delete<{ id: string; deleted: boolean }>(`/purchase-orders/${id}`).then((r) => r.data),
};
