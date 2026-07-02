import { apiClient } from '@/api/client';
import type {
  Assortment,
  AssortmentPart,
  AssemblyRecord,
  AssemblyStatus,
  ComponentAvailability,
  Paginated,
} from '@/api/types';
import type { ListParams } from './master';

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

// JSON payload for an assembly submission. The engineer enters Assembled SETS; the
// backend derives component consumption from the product assortment. orderId optional.
export interface AssemblyInput {
  customerId: string;
  productId: string;
  orderId: string;
  assemblyLine: string;
  operatorCount: number;
  // Shift computed from the engineer's phone clock (see utils/shift.ts); server time is a fallback.
  shift?: 'A' | 'B' | 'C';
  assembledSets?: number; // normal sets (consume the order)
  extraSets?: number; // extra sets from surplus (consume the product surplus pools)
  fromSurplus?: boolean; // true → this is an extra-from-surplus record
  rejectedQuantity: number;
  inputQuantity?: number;
  rejectionReason?: string;
  remarks?: string;
}

type AssemblyCreateResult = {
  record: AssemblyRecord;
  orderStatus: AssemblyStatus | null;
  componentAvailability: ComponentAvailability;
  completion: { completed: boolean; movedToSurplus: { moulded: unknown[]; outsourced: unknown[] } } | null;
};

export const assemblyApi = {
  create: (form: FormData) =>
    apiClient.post<AssemblyCreateResult>('/assembly', form, MULTIPART).then((r) => r.data),
  submit: (input: AssemblyInput) =>
    apiClient.post<AssemblyCreateResult>('/assembly', input).then((r) => r.data),
  // The order's finished component availability (drives the form). orderId scopes it.
  availability: (customerId: string, productId: string, orderId?: string) =>
    apiClient
      .get<ComponentAvailability>('/assembly/availability', {
        params: { customerId, productId, ...(orderId ? { orderId } : {}) },
      })
      .then((r) => r.data),
  // Saved assortment (parts-per-set) for a product.
  assortment: (customerId: string, productId: string) =>
    apiClient
      .get<Assortment>('/assembly/assortments', { params: { customerId, productId } })
      .then((r) => r.data),
  // Create/edit the assortment for a product.
  saveAssortment: (input: { customerId: string; productId: string; parts: AssortmentPart[] }) =>
    apiClient.post<Assortment>('/assembly/assortments', input).then((r) => r.data),
  listMine: (params: ListParams = {}) =>
    apiClient.get<Paginated<AssemblyRecord>>('/assembly/mine', { params }).then((r) => r.data),
  status: (orderId: string) =>
    apiClient.get<AssemblyStatus>('/assembly/status', { params: { orderId } }).then((r) => r.data),
  get: (id: string) =>
    apiClient.get<{ record: AssemblyRecord }>(`/assembly/${id}`).then((r) => r.data.record),
};
