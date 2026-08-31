import { apiClient } from '@/api/client';
import type { Customer, Machine, MachineCategory, Paginated, Product } from '@/api/types';

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
}

// Customers + Products + Machines. Full CRUD so the web console can set up the master data
// the factory workflow runs on (companies, products, machines) — same operations as the
// mobile admin master-data screens. Backend returns 409 *_in_use when history protects a row.
export const masterApi = {
  // Customers (companies)
  listCustomers: (params: ListParams = {}) =>
    apiClient.get<Paginated<Customer>>('/customers', { params }).then((r) => r.data),
  createCustomer: (name: string) =>
    apiClient.post<{ customer: Customer }>('/customers', { name }).then((r) => r.data.customer),
  updateCustomer: (id: string, name: string) =>
    apiClient.patch<{ customer: Customer }>(`/customers/${id}`, { name }).then((r) => r.data.customer),
  deleteCustomer: (id: string) =>
    apiClient.delete<{ id: string; deleted: boolean }>(`/customers/${id}`).then((r) => r.data),

  // Products (each belongs to a customer; filter by customerId for cascading dropdowns)
  listProducts: (params: ListParams = {}) =>
    apiClient.get<Paginated<Product>>('/products', { params }).then((r) => r.data),
  createProduct: (input: { customerId: string; name: string; itemCode: string; partName?: string }) =>
    apiClient.post<{ product: Product }>('/products', input).then((r) => r.data.product),
  updateProduct: (id: string, input: { name?: string; itemCode?: string; partName?: string }) =>
    apiClient.patch<{ product: Product }>(`/products/${id}`, input).then((r) => r.data.product),
  deleteProduct: (id: string) =>
    apiClient.delete<{ id: string; deleted: boolean }>(`/products/${id}`).then((r) => r.data),

  // Machine Master (injection / blow molding). Engineers only select these in the forms.
  listMachines: (params: { category?: MachineCategory } = {}) =>
    apiClient.get<{ machines: Machine[] }>('/machines', { params }).then((r) => r.data.machines),
  createMachine: (input: { name: string; category: MachineCategory }) =>
    apiClient.post<{ machine: Machine }>('/machines', input).then((r) => r.data.machine),
  updateMachine: (id: string, input: { name?: string; category?: MachineCategory }) =>
    apiClient.patch<{ machine: Machine }>(`/machines/${id}`, input).then((r) => r.data.machine),
  deleteMachine: (id: string) =>
    apiClient.delete<{ id: string; deleted: boolean }>(`/machines/${id}`).then((r) => r.data),
};
