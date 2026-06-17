import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { masterApi, type OrderListParams } from '@/api/endpoints/master';
import { queryKeys } from '@/api/queryKeys';
import type { Customer, Order, Paginated, Product } from '@/api/types';
import type { SelectOption } from '@/components';

export const SHIFT_OPTIONS: SelectOption[] = [
  { label: 'Shift A', value: 'A' },
  { label: 'Shift B', value: 'B' },
  { label: 'Shift C', value: 'C' },
];

interface UseCustomerProductOptions {
  // Extra Order list filters — e.g. { productionStatus: 'Active' } for the Moulding
  // workspace, { assemblyStatus: 'Active' } for the Assembly workspace. Completed-phase
  // orders drop out of the active workspace automatically.
  orderFilter?: Partial<OrderListParams>;
}

// Shared Customer → Product → Order cascade used by the engineer entry forms. Engineers
// can read /customers, /products and /orders (RBAC allows it) purely to drive these
// dropdowns. The Order layer is opt-in via `orderFilter` but always returned, so forms
// that don't use orders simply ignore the order fields.
export function useCustomerProduct(opts: UseCustomerProductOptions = {}) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: queryKeys.customers({ page: 1, limit: 100 }),
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }) as Promise<Paginated<Customer>>,
  });

  const productParams = { customerId: customerId ?? undefined, limit: 100 };
  const products = useQuery({
    queryKey: queryKeys.products(productParams),
    queryFn: () => masterApi.listProducts(productParams) as Promise<Paginated<Product>>,
    enabled: !!customerId,
  });

  const orderParams: OrderListParams = {
    customerId: customerId ?? undefined,
    productId: productId ?? undefined,
    limit: 100,
    ...opts.orderFilter,
  };
  const orders = useQuery({
    queryKey: queryKeys.orders(orderParams),
    queryFn: () => masterApi.listOrders(orderParams) as Promise<Paginated<Order>>,
    enabled: !!customerId && !!productId,
  });

  const customerOptions: SelectOption[] = (customers.data?.data ?? []).map((c) => ({
    label: c.name,
    value: c.id,
  }));
  const productOptions: SelectOption[] = (products.data?.data ?? []).map((p) => ({
    label: p.name,
    value: p.id,
  }));
  const orderList: Order[] = orders.data?.data ?? [];
  const orderOptions: SelectOption[] = orderList.map((o) => ({
    label: o.orderCode ?? o.id,
    value: o.id,
    hint: `${o.orderQuantity} sets`,
  }));
  const selectedOrder: Order | null = orderList.find((o) => o.id === orderId) ?? null;

  const selectCustomer = (v: string) => {
    setCustomerId(v);
    setProductId(null);
    setOrderId(null);
  };
  const selectProduct = (v: string) => {
    setProductId(v);
    setOrderId(null);
  };

  return {
    customerId,
    productId,
    orderId,
    setProductId,
    setOrderId,
    selectCustomer,
    selectProduct,
    customers,
    products,
    orders,
    customerOptions,
    productOptions,
    orderOptions,
    orderList,
    selectedOrder,
  };
}
