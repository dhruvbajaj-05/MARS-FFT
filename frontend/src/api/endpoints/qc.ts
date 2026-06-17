import { apiClient } from '@/api/client';
import type { FinishedGoodsBalance, Paginated, QCRecord, QCStatus } from '@/api/types';
import type { ListParams } from './master';

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

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
};
