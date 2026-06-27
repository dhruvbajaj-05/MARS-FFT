import { apiClient } from '@/api/client';
import type {
  LearnedMold,
  MouldingDashboardCustomer,
  MouldingRecord,
  MouldingStatus,
  MoldsResponse,
  OrderMold,
  OrderMoldInput,
  OrderMoldsResponse,
  Paginated,
  RecoveryEntry,
} from '@/api/types';
import type { ListParams } from './master';

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

// Production submission payload.
export interface MouldingInput {
  orderId: string;
  productId: string;
  customerId: string;
  moldName: string;
  partName?: string;
  machineNumber: string;
  shotsDone: number;
  rejectedShots?: number;
  cavity?: number;
  requiredShots?: number;
  rejectionReasons?: string[];
  comments?: string;
}

export interface MoldInput {
  customerId: string;
  productId: string;
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots?: number;
}

export interface RecoverInput {
  orderId: string;
  productId: string;
  customerId: string;
  recoveries: RecoveryEntry[];
}

export interface MouldingUpdateInput {
  shotsDone?: number;
  rejectedShots?: number;
  rejectionReasons?: string[];
  comments?: string;
}

export const mouldingApi = {
  // Multipart create (kept for image-attaching flows).
  create: (form: FormData) =>
    apiClient
      .post<{ record: MouldingRecord; orderStatus: MouldingStatus }>('/moulding', form, MULTIPART)
      .then((r) => r.data),

  // JSON submit (standard production push).
  submit: (input: MouldingInput) =>
    apiClient
      .post<{ record: MouldingRecord; orderStatus: MouldingStatus }>('/moulding', input)
      .then((r) => r.data),

  // Edit a record within the 12-hour window.
  update: (id: string, input: MouldingUpdateInput) =>
    apiClient
      .patch<{ record: MouldingRecord }>(`/moulding/${id}`, input)
      .then((r) => r.data.record),

  // Delete a record within the 12-hour window (reverses stock).
  delete: (id: string) =>
    apiClient.delete<{ deleted: boolean }>(`/moulding/${id}`).then((r) => r.data),

  // Submit recovered good pieces from rejected shots → product surplus.
  recover: (input: RecoverInput) =>
    apiClient
      .post<{ recovered: { partName: string; goodPieces: number }[] }>('/moulding/recover', input)
      .then((r) => r.data),

  // Moulding dashboard: companies → products → active order counts.
  dashboard: () =>
    apiClient
      .get<{ customers: MouldingDashboardCustomer[] }>('/moulding/dashboard')
      .then((r) => r.data.customers),

  // Learned molds for a product (dropdown + part/cavity autofill).
  molds: (productId: string) =>
    apiClient.get<MoldsResponse>('/moulding/molds', { params: { productId } }).then((r) => r.data),

  // Define/edit a mold.
  upsertMold: (input: MoldInput) =>
    apiClient.post<{ mold: LearnedMold }>('/moulding/molds', input).then((r) => r.data.mold),

  // Per-order Mould Setup: molds set up for an order + product-level suggestions.
  orderMolds: (orderId: string) =>
    apiClient.get<OrderMoldsResponse>('/moulding/order-molds', { params: { orderId } }).then((r) => r.data),

  // Define/edit a mold for one order.
  upsertOrderMold: (input: OrderMoldInput) =>
    apiClient.post<{ mold: OrderMold }>('/moulding/order-molds', input).then((r) => r.data.mold),

  // All moulding records for the dept (shared visibility — no user filter).
  listMine: (params: ListParams = {}) =>
    apiClient.get<Paginated<MouldingRecord>>('/moulding/mine', { params }).then((r) => r.data),

  status: (orderId: string) =>
    apiClient.get<MouldingStatus>('/moulding/status', { params: { orderId } }).then((r) => r.data),

  // Remembered rejection reasons for the multi-select list.
  rejectionReasons: () =>
    apiClient.get<{ reasons: string[] }>('/moulding/rejection-reasons').then((r) => r.data.reasons),

  get: (id: string) =>
    apiClient.get<{ record: MouldingRecord }>(`/moulding/${id}`).then((r) => r.data.record),
};
