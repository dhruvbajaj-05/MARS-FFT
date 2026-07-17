import { apiClient } from '@/api/client';
import type {
  CustomerDashboard,
  CustomerDefectReport,
  CustomerOrderDashboard,
  CustomerOrderDetails,
  CustomerOrderProgress,
  CustomerOrderRow,
  CustomerProductOrders,
  CustomerProductsResponse,
  Paginated,
} from '@/api/types';

export const customerApi = {
  dashboard: () => apiClient.get<CustomerDashboard>('/customer/dashboard').then((r) => r.data),
  orders: (params: { page?: number; limit?: number } = {}) =>
    apiClient.get<Paginated<CustomerOrderRow>>('/customer/orders', { params }).then((r) => r.data),
  orderDetails: (id: string) =>
    apiClient.get<CustomerOrderDetails>(`/customer/orders/${id}`).then((r) => r.data),
  orderProgress: (id: string) =>
    apiClient.get<CustomerOrderProgress>(`/customer/orders/${id}/progress`).then((r) => r.data),

  // Product-first portal (Home → Product → Order dashboard).
  products: () =>
    apiClient.get<CustomerProductsResponse>('/customer/products').then((r) => r.data),
  productOrders: (productId: string) =>
    apiClient.get<CustomerProductOrders>(`/customer/products/${productId}/orders`).then((r) => r.data),
  orderDashboard: (id: string) =>
    apiClient.get<CustomerOrderDashboard>(`/customer/orders/${id}/dashboard`).then((r) => r.data),

  // Append a comment to a QC case on one of the customer's own orders (read-only otherwise).
  addQcComment: (orderId: string, reportId: string, text: string) =>
    apiClient
      .post<{ report: CustomerDefectReport }>(
        `/customer/orders/${orderId}/qc-reports/${reportId}/comments`,
        { text }
      )
      .then((r) => r.data.report),
};
