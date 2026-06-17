import { apiClient } from '@/api/client';
import type { Customer, Machine, MachineCategory, Order, Paginated, Product } from '@/api/types';

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  productId?: string;
}

// Order list filters (revised workflow): cascade + OrderID search + workspace filters.
export interface OrderListParams extends ListParams {
  orderId?: string;
  orderCode?: string;
  status?: 'Active' | 'Completed' | 'Archived';
  productionStatus?: 'Active' | 'Completed';
  assemblyStatus?: 'Active' | 'Completed';
}

export const masterApi = {
  // Customers
  listCustomers: (params: ListParams = {}) =>
    apiClient.get<Paginated<Customer>>('/customers', { params }).then((r) => r.data),
  createCustomer: (name: string) =>
    apiClient.post<{ customer: Customer }>('/customers', { name }).then((r) => r.data.customer),
  // Safe delete (admin). Backend returns 409 customer_in_use when manufacturing history exists.
  deleteCustomer: (id: string) =>
    apiClient.delete<{ id: string; deleted: boolean }>(`/customers/${id}`).then((r) => r.data),

  // Products (filter by customerId for cascading dropdowns)
  listProducts: (params: ListParams = {}) =>
    apiClient.get<Paginated<Product>>('/products', { params }).then((r) => r.data),
  createProduct: (input: { customerId: string; name: string; partName?: string }) =>
    apiClient.post<{ product: Product }>('/products', input).then((r) => r.data.product),
  // Delete/archive (admin). Backend archives products with production history, else removes.
  deleteProduct: (id: string) =>
    apiClient
      .delete<{ id: string; archived: boolean; deleted: boolean }>(`/products/${id}`)
      .then((r) => r.data),

  // Orders
  listOrders: (params: OrderListParams = {}) =>
    apiClient.get<Paginated<Order>>('/orders', { params }).then((r) => r.data),
  getOrder: (id: string) =>
    apiClient.get<{ order: Order }>(`/orders/${id}`).then((r) => r.data.order),
  createOrder: (input: { customerId: string; productId: string; orderQuantity: number }) =>
    apiClient.post<{ order: Order }>('/orders', input).then((r) => r.data.order),

  // Lifecycle transitions (admin). Move a workspace to history; nothing is deleted.
  completeProduction: (id: string) =>
    apiClient.post<{ order: Order }>(`/orders/${id}/complete-production`).then((r) => r.data.order),
  completeAssembly: (id: string) =>
    apiClient.post<{ order: Order }>(`/orders/${id}/complete-assembly`).then((r) => r.data.order),
  archiveOrder: (id: string) =>
    apiClient.post<{ order: Order }>(`/orders/${id}/archive`).then((r) => r.data.order),

  // Machine Master (admin manages; moulding lists for the dropdown).
  listMachines: (params: { includeArchived?: boolean; category?: MachineCategory } = {}) =>
    apiClient.get<{ machines: Machine[] }>('/machines', { params }).then((r) => r.data.machines),
  createMachine: (input: { name: string; category: MachineCategory }) =>
    apiClient.post<{ machine: Machine }>('/machines', input).then((r) => r.data.machine),
  updateMachine: (id: string, input: { name?: string; category?: MachineCategory }) =>
    apiClient.patch<{ machine: Machine }>(`/machines/${id}`, input).then((r) => r.data.machine),
  archiveMachine: (id: string, archived = true) =>
    apiClient.post<{ machine: Machine }>(`/machines/${id}/archive`, { archived }).then((r) => r.data.machine),
};
