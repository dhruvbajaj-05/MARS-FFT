import { apiClient } from '@/api/client';
import type {
  ComponentAvailability,
  ComponentByOrderTree,
  ComponentStoreTree,
  FinishedGoodsBalance,
  FinishedGoodsTree,
  OutsourcedItem,
  OutsourcedReceipt,
  OutsourcedStore,
} from '@/api/types';

// Read-only store views (Phases 2 / 4). Balances are mutated only by department
// submissions on the backend; these endpoints just display them.
export const storeApi = {
  // Component Store — Customer → Product → Part → quantity.
  components: (customerId?: string) =>
    apiClient
      .get<ComponentStoreTree>('/store/components', { params: customerId ? { customerId } : {} })
      .then((r) => r.data),
  componentAvailability: (customerId: string, productId: string, orderId?: string) =>
    apiClient
      .get<ComponentAvailability>('/store/components/availability', {
        params: { customerId, productId, ...(orderId ? { orderId } : {}) },
      })
      .then((r) => r.data),
  // Order-scoped Component Store — Customer → Product → OrderID → Pending/Finished/Surplus.
  componentsByOrder: (params: { customerId?: string; productId?: string; orderId?: string } = {}) =>
    apiClient
      .get<ComponentByOrderTree>('/store/components/by-order', { params })
      .then((r) => r.data),

  // Finished Goods Store — Customer → Product → quantity.
  finishedGoods: (customerId?: string) =>
    apiClient
      .get<FinishedGoodsTree>('/store/finished-goods', { params: customerId ? { customerId } : {} })
      .then((r) => r.data),
  finishedGoodsAvailability: (customerId: string, productId: string) =>
    apiClient
      .get<FinishedGoodsBalance>('/store/finished-goods/availability', {
        params: { customerId, productId },
      })
      .then((r) => r.data),
};

// Outsourced Components store. Reads for component viewers; writes for Moulding Engineers.
// Dead simple, per order (no master/product BOM): add a component (name + assortment) and
// record received quantities. Multiple deliveries accumulate. Finished / Pending / Surplus
// are derived by the backend reconcile engine — exactly like moulding inventory.
export const outsourcedApi = {
  list: (params: { customerId: string; productId: string; orderId: string }) =>
    apiClient.get<OutsourcedStore>('/store/outsourced', { params }).then((r) => r.data),

  // Add/update a component's assortment (per-set) for THIS order (Moulding only).
  setBom: (body: { customerId: string; productId: string; orderId: string; componentName: string; perSet: number }) =>
    apiClient.post<{ item: OutsourcedItem }>('/store/outsourced/bom', body).then((r) => r.data.item),

  removeBom: (id: string) =>
    apiClient
      .delete<{ id: string; deleted: boolean }>(`/store/outsourced/bom/${id}`)
      .then((r) => r.data),

  // Record received stock (a transaction; multiple deliveries accumulate). perSet is
  // optional — supply it to set the component's assortment at the same time (Moulding only).
  receive: (body: {
    customerId: string;
    productId: string;
    orderId: string;
    componentName: string;
    quantityReceived: number;
    perSet?: number;
    remarks?: string;
  }) => apiClient.post<{ receipt: OutsourcedReceipt }>('/store/outsourced/receipt', body).then((r) => r.data.receipt),

  updateReceipt: (id: string, body: { quantityReceived?: number; remarks?: string }) =>
    apiClient.patch<{ receipt: OutsourcedReceipt }>(`/store/outsourced/receipt/${id}`, body).then((r) => r.data.receipt),

  deleteReceipt: (id: string) =>
    apiClient
      .delete<{ id: string; deleted: boolean }>(`/store/outsourced/receipt/${id}`)
      .then((r) => r.data),
};
