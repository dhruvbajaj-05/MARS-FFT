import { apiClient } from '@/api/client';
import type { DispatchRecord, DispatchStatus, FinishedGoodsBalance, Paginated } from '@/api/types';
import type { ListParams } from './master';

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

// JSON payload for a dispatch submission (MVP — no photo/document upload). orderId optional.
export interface DispatchInput {
  customerId: string;
  productId: string;
  orderId?: string;
  dispatchDate: string; // ISO date
  packedQuantity: number;
  cartonCount: number;
  transporterName: string;
  vehicleNumber: string;
  lrNumber: string;
  invoiceNumber: string;
  dispatchRemarks?: string;
}

type DispatchCreateResult = {
  record: DispatchRecord;
  orderStatus: DispatchStatus | null;
  finishedGoods: FinishedGoodsBalance;
};

// Backend route is /packing-dispatch.
export const dispatchApi = {
  create: (form: FormData) =>
    apiClient.post<DispatchCreateResult>('/packing-dispatch', form, MULTIPART).then((r) => r.data),
  submit: (input: DispatchInput) =>
    apiClient.post<DispatchCreateResult>('/packing-dispatch', input).then((r) => r.data),
  listMine: (params: ListParams = {}) =>
    apiClient.get<Paginated<DispatchRecord>>('/packing-dispatch/mine', { params }).then((r) => r.data),
  status: (orderId: string) =>
    apiClient
      .get<DispatchStatus>('/packing-dispatch/status', { params: { orderId } })
      .then((r) => r.data),
  get: (id: string) =>
    apiClient.get<{ record: DispatchRecord }>(`/packing-dispatch/${id}`).then((r) => r.data.record),
  // Edit / delete own record within the 12-hour window (adjusts Finished Goods).
  update: (id: string, input: Partial<Omit<DispatchInput, 'customerId' | 'productId' | 'orderId'>>) =>
    apiClient.patch<{ record: DispatchRecord }>(`/packing-dispatch/${id}`, input).then((r) => r.data.record),
  remove: (id: string) =>
    apiClient.delete<{ deleted: boolean }>(`/packing-dispatch/${id}`).then((r) => r.data),
};
