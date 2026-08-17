import { apiClient } from '@/api/client';
import type { Customer, Paginated, Product } from '@/api/types';

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
}

// Customers + Products. Only the reads the web admin needs today (the PO-creation cascade
// lists customers, then products filtered by the chosen customer). Mirrors mobile masterApi.
export const masterApi = {
  listCustomers: (params: ListParams = {}) =>
    apiClient.get<Paginated<Customer>>('/customers', { params }).then((r) => r.data),
  listProducts: (params: ListParams = {}) =>
    apiClient.get<Paginated<Product>>('/products', { params }).then((r) => r.data),
};
