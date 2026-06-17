import { apiClient } from '@/api/client';
import type {
  ComponentAvailability,
  ComponentByOrderTree,
  ComponentStoreTree,
  FinishedGoodsBalance,
  FinishedGoodsTree,
  OutsourcedItem,
  OutsourcedStore,
} from '@/api/types';

type OutsourcedScope = 'order' | 'surplus';

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
export const outsourcedApi = {
  list: (params: { customerId: string; productId: string; orderId: string }) =>
    apiClient.get<OutsourcedStore>('/store/outsourced', { params }).then((r) => r.data),

  // Create/upsert. scope 'order' (default) writes the order cell; 'surplus' the product
  // pool. mode 'set' (default) sets the absolute quantity; 'add' increments it.
  create: (body: {
    customerId: string;
    productId: string;
    orderId?: string;
    componentName: string;
    quantity: number;
    scope?: OutsourcedScope;
    mode?: 'set' | 'add';
  }) => apiClient.post<{ item: OutsourcedItem }>('/store/outsourced', body).then((r) => r.data.item),

  // Allocate received stock for an order: splits into order allocation + product surplus
  // using the per-set requirement (Moulding only).
  allocate: (body: {
    customerId: string;
    productId: string;
    orderId: string;
    componentName: string;
    received: number;
    perSet: number;
  }) =>
    apiClient
      .post<{ allocation: { componentName: string; requiredQuantity: number; orderAllocation: number; addedToOrder: number; addedToSurplus: number } }>(
        '/store/outsourced/allocate',
        body,
      )
      .then((r) => r.data.allocation),

  // Edit: pass { quantity } to set absolutely, or { delta } to adjust.
  update: (id: string, body: { quantity?: number; delta?: number; scope?: OutsourcedScope }) =>
    apiClient.patch<{ item: OutsourcedItem }>(`/store/outsourced/${id}`, body).then((r) => r.data.item),

  remove: (id: string, scope: OutsourcedScope = 'order') =>
    apiClient
      .delete<{ id: string; deleted: boolean }>(`/store/outsourced/${id}`, { params: { scope } })
      .then((r) => r.data),
};
