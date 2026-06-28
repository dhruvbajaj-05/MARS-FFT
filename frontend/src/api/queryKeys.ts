// Centralized React Query key factory → precise, typo-proof cache invalidation.
export const queryKeys = {
  auth: { me: ['auth', 'me'] as const },

  customers: (params?: unknown) => ['customers', params ?? {}] as const,
  products: (params?: unknown) => ['products', params ?? {}] as const,
  orders: (params?: unknown) => ['orders', params ?? {}] as const,
  order: (id: string) => ['orders', 'detail', id] as const,
  users: (params?: unknown) => ['users', params ?? {}] as const,

  dept: (dept: string) => ({
    mine: (params?: unknown) => [dept, 'mine', params ?? {}] as const,
    status: (orderId: string) => [dept, 'status', orderId] as const,
    detail: (id: string) => [dept, 'detail', id] as const,
  }),

  machines: (params?: unknown) => ['machines', params ?? {}] as const,
  rejectionReasons: ['moulding', 'rejection-reasons'] as const,
  mouldingDashboard: ['moulding', 'dashboard'] as const,
  molds: (productId: string) => ['moulding', 'molds', productId] as const,
  orderMolds: (orderId: string) => ['moulding', 'order-molds', orderId] as const,
  assortment: (customerId: string, productId: string) =>
    ['assembly', 'assortment', customerId, productId] as const,

  store: {
    components: (customerId?: string) => ['store', 'components', customerId ?? 'all'] as const,
    componentsByOrder: (params?: unknown) => ['store', 'components', 'by-order', params ?? {}] as const,
    componentAvailability: (customerId: string, productId: string, orderId?: string) =>
      ['store', 'components', 'availability', customerId, productId, orderId ?? 'all'] as const,
    finishedGoods: (customerId?: string) => ['store', 'finished-goods', customerId ?? 'all'] as const,
    finishedGoodsAvailability: (customerId: string, productId: string) =>
      ['store', 'finished-goods', 'availability', customerId, productId] as const,
    outsourced: (customerId: string, productId: string, orderId: string) =>
      ['store', 'outsourced', customerId, productId, orderId] as const,
  },

  customer: {
    dashboard: ['customer', 'dashboard'] as const,
    orders: (params?: unknown) => ['customer', 'orders', params ?? {}] as const,
    order: (id: string) => ['customer', 'order', id] as const,
    progress: (id: string) => ['customer', 'order', id, 'progress'] as const,
  },

  admin: {
    dashboard: ['admin', 'dashboard'] as const,
    productionSummary: ['admin', 'production-summary'] as const,
    rejections: ['admin', 'rejections'] as const,
    departments: ['admin', 'departments'] as const,
    customers: (params?: unknown) => ['admin', 'customers', params ?? {}] as const,
    users: ['admin', 'users'] as const,
    orders: (params?: unknown) => ['admin', 'orders', params ?? {}] as const,
    delayed: (params?: unknown) => ['admin', 'orders', 'delayed', params ?? {}] as const,
    orderTimeline: (id: string) => ['admin', 'orders', id, 'timeline'] as const,
    records: {
      moulding: (params?: unknown) => ['admin', 'records', 'moulding', params ?? {}] as const,
      assembly: (params?: unknown) => ['admin', 'records', 'assembly', params ?? {}] as const,
      qc: (params?: unknown) => ['admin', 'records', 'qc', params ?? {}] as const,
      dispatch: (params?: unknown) => ['admin', 'records', 'dispatch', params ?? {}] as const,
    },
  },
} as const;
