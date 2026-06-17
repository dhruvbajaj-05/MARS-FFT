import { apiClient } from '@/api/client';
import type {
  LearnedMold,
  MouldingRecord,
  MouldingStatus,
  MoldsResponse,
  OrderMold,
  OrderMoldInput,
  OrderMoldsResponse,
  Paginated,
} from '@/api/types';
import type { ListParams } from './master';

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

// JSON payload for a production submission. The engineer enters Shots Done + Rejected;
// cavity/part are resolved from the selected mold (cavity sent only for a brand-new mold).
export interface MouldingInput {
  orderId: string;
  productId: string;
  customerId: string;
  moldName: string;
  partName?: string;
  machineNumber: string;
  // shift is auto-detected server-side (no longer sent).
  shotsDone: number;
  rejectedParts: number;
  cavity?: number;
  requiredShots?: number;
  rejectionReason?: string;
  comments?: string;
}

// Payload to define/edit a mold (Mold Name, Part, Cavity, Required Shots).
export interface MoldInput {
  customerId: string;
  productId: string;
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots?: number;
}

export const mouldingApi = {
  // Multipart create (kept for image-attaching flows).
  create: (form: FormData) =>
    apiClient
      .post<{ record: MouldingRecord; orderStatus: MouldingStatus }>('/moulding', form, MULTIPART)
      .then((r) => r.data),
  // JSON submit (MVP form). Backend parses req.body for application/json the same way.
  submit: (input: MouldingInput) =>
    apiClient
      .post<{ record: MouldingRecord; orderStatus: MouldingStatus }>('/moulding', input)
      .then((r) => r.data),
  // Learned molds for a product (dropdown + part/cavity autofill).
  molds: (productId: string) =>
    apiClient.get<MoldsResponse>('/moulding/molds', { params: { productId } }).then((r) => r.data),
  // Define/edit a mold.
  upsertMold: (input: MoldInput) =>
    apiClient.post<{ mold: LearnedMold }>('/moulding/molds', input).then((r) => r.data.mold),
  // Per-order Mould Setup: molds set up for an order + product-level suggestions.
  orderMolds: (orderId: string) =>
    apiClient.get<OrderMoldsResponse>('/moulding/order-molds', { params: { orderId } }).then((r) => r.data),
  // Define/edit a mold for one order (Mold Name, Part, Cavity, Required Shots).
  upsertOrderMold: (input: OrderMoldInput) =>
    apiClient.post<{ mold: OrderMold }>('/moulding/order-molds', input).then((r) => r.data.mold),
  listMine: (params: ListParams = {}) =>
    apiClient.get<Paginated<MouldingRecord>>('/moulding/mine', { params }).then((r) => r.data),
  status: (orderId: string) =>
    apiClient.get<MouldingStatus>('/moulding/status', { params: { orderId } }).then((r) => r.data),
  // Remembered rejection reasons (dropdown + custom entry).
  rejectionReasons: () =>
    apiClient.get<{ reasons: string[] }>('/moulding/rejection-reasons').then((r) => r.data.reasons),
  get: (id: string) =>
    apiClient.get<{ record: MouldingRecord }>(`/moulding/${id}`).then((r) => r.data.record),
};
