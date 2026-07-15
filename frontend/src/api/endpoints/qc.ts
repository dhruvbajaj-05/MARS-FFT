import { apiClient } from '@/api/client';
import type { FinishedGoodsBalance, Paginated, QCRecord, QCStatus } from '@/api/types';
import type { ListParams } from './master';

// Don't hand-set Content-Type for FormData in React Native — it omits the multipart
// boundary and the request hangs (surfaces as a false "network" error). Let axios/RN set
// it; just extend the upload timeout.
const MULTIPART = { timeout: 120000 };

// JSON payload for a QC submission (MVP — no photo upload). orderId optional.
export interface QCInput {
  customerId: string;
  productId: string;
  orderId?: string;
  inspectionDate: string; // ISO date
  inspectionType: string;
  sampleSize: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  defectCount: number;
  correctiveAction?: string;
  remarks?: string;
}

type QCCreateResult = {
  record: QCRecord;
  orderStatus: QCStatus | null;
  finishedGoods: FinishedGoodsBalance;
};

export const qcApi = {
  create: (form: FormData) =>
    apiClient.post<QCCreateResult>('/qc', form, MULTIPART).then((r) => r.data),
  submit: (input: QCInput) => apiClient.post<QCCreateResult>('/qc', input).then((r) => r.data),
  listMine: (params: ListParams = {}) =>
    apiClient.get<Paginated<QCRecord>>('/qc/mine', { params }).then((r) => r.data),
  status: (orderId: string) =>
    apiClient.get<QCStatus>('/qc/status', { params: { orderId } }).then((r) => r.data),
  get: (id: string) => apiClient.get<{ record: QCRecord }>(`/qc/${id}`).then((r) => r.data.record),
  // Edit / delete own record within the 12-hour window (adjusts Finished Goods).
  update: (id: string, input: Partial<Omit<QCInput, 'customerId' | 'productId' | 'orderId'>>) =>
    apiClient.patch<{ record: QCRecord }>(`/qc/${id}`, input).then((r) => r.data.record),
  remove: (id: string) => apiClient.delete<{ deleted: boolean }>(`/qc/${id}`).then((r) => r.data),
};
