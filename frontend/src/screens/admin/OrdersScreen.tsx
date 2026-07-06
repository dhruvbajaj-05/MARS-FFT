import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';

import { masterApi, type OrderListParams } from '@/api/endpoints/master';
import { queryKeys } from '@/api/queryKeys';
import type { Customer, Order, Paginated, Product } from '@/api/types';
import {
  AppText,
  Banner,
  Button,
  Card,
  FormField,
  QueryBoundary,
  Screen,
  Select,
  type SelectOption,
} from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useTheme } from '@/theme/ThemeProvider';

const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'Active' },
  { label: 'Completed', value: 'Completed' },
];

// Inline edit panel for a single order (order quantity).
function OrderEditPanel({ order, onClose }: { order: Order; onClose: () => void }) {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState(String(order.orderQuantity));

  const save = useMutation({
    mutationFn: () => masterApi.updateOrder(order.id, { orderQuantity: Number(quantity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });
  const error = save.error instanceof ApiError ? friendlyMessage(save.error) : null;
  const qtyNum = Number(quantity);
  const canSave = Number.isFinite(qtyNum) && qtyNum >= 0;

  return (
    <View style={{ marginTop: spacing(2) }}>
      {error ? <Banner tone="danger" message={error} /> : null}
      <FormField
        label="Order quantity (Sets)"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
      />
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        <Button label="Save" loading={save.isPending} disabled={!canSave} onPress={() => save.mutate()} style={{ flex: 1 }} />
        <Button label="Cancel" variant="secondary" disabled={save.isPending} onPress={onClose} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

// Admin → Create + manage Orders. Every order gets a unique OrderID (FFT-#####); admin
// can filter by Customer / Product / OrderID and drive the lifecycle (Complete
// Production, Complete Assembly, Archive). Completing a phase moves its records to
// history; nothing is deleted.
export function OrdersScreen() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const navigation = useNavigation<any>();

  // ---- Create form ----
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [ok, setOk] = useState<string | null>(null);

  // ---- Filters ----
  const [fCustomerId, setFCustomerId] = useState<string | null>(null);
  const [fProductId, setFProductId] = useState<string | null>(null);
  const [fOrderCode, setFOrderCode] = useState('');
  const [fStatus, setFStatus] = useState<string | null>('');

  // ---- Per-row edit / delete ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: queryKeys.customers({ page: 1, limit: 100 }),
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }) as Promise<Paginated<Customer>>,
  });
  // All products (admin) for the create cascade + name map.
  const productParams = { customerId: customerId ?? undefined, limit: 100 };
  const products = useQuery({
    queryKey: queryKeys.products(productParams),
    queryFn: () => masterApi.listProducts(productParams) as Promise<Paginated<Product>>,
    enabled: !!customerId,
  });
  const allProducts = useQuery({
    queryKey: queryKeys.products({ all: true, limit: 200 }),
    queryFn: () => masterApi.listProducts({ limit: 200 }) as Promise<Paginated<Product>>,
  });
  // Products for the filter cascade (depends on the filter customer).
  const filterProducts = useQuery({
    queryKey: queryKeys.products({ filter: true, customerId: fCustomerId ?? undefined, limit: 100 }),
    queryFn: () =>
      masterApi.listProducts({ customerId: fCustomerId ?? undefined, limit: 100 }) as Promise<Paginated<Product>>,
    enabled: !!fCustomerId,
  });

  const orderParams: OrderListParams = useMemo(
    () => ({
      limit: 100,
      customerId: fCustomerId ?? undefined,
      productId: fProductId ?? undefined,
      orderCode: fOrderCode.trim() || undefined,
      status: (fStatus as OrderListParams['status']) || undefined,
    }),
    [fCustomerId, fProductId, fOrderCode, fStatus],
  );
  const orders = useQuery({
    queryKey: queryKeys.orders(orderParams),
    queryFn: () => masterApi.listOrders(orderParams) as Promise<Paginated<Order>>,
  });

  const create = useMutation({
    mutationFn: () =>
      masterApi.createOrder({ customerId: customerId!, productId: productId!, orderQuantity: Number(quantity) }),
    onSuccess: (o) => {
      setOk(`Order ${o.orderCode ?? ''} created for ${o.orderQuantity} sets`);
      setQuantity('');
      setProductId(null);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const lifecycle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'production' | 'assembly' }) =>
      action === 'production' ? masterApi.completeProduction(id) : masterApi.completeAssembly(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => masterApi.deleteOrder(id),
    onSuccess: () => {
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const confirm = (title: string, message: string, onConfirm: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onConfirm },
    ]);

  const error = create.error instanceof ApiError ? friendlyMessage(create.error) : null;
  const lifecycleError = lifecycle.error instanceof ApiError ? friendlyMessage(lifecycle.error) : null;
  const deleteError = remove.error instanceof ApiError ? friendlyMessage(remove.error) : null;

  const customerOptions: SelectOption[] = (customers.data?.data ?? []).map((c) => ({ label: c.name, value: c.id }));
  const filterCustomerOptions: SelectOption[] = [
    { label: 'All customers', value: '' },
    ...customerOptions,
  ];
  const productOptions: SelectOption[] = (products.data?.data ?? []).map((p) => ({ label: p.name, value: p.id }));
  const filterProductOptions: SelectOption[] = [
    { label: 'All products', value: '' },
    ...(filterProducts.data?.data ?? []).map((p) => ({ label: p.name, value: p.id })),
  ];

  const nameMaps = useMemo(() => {
    const cust = new Map((customers.data?.data ?? []).map((c) => [c.id, c.name] as [string, string]));
    const prod = new Map((allProducts.data?.data ?? []).map((p) => [p.id, p.name] as [string, string]));
    return { cust, prod };
  }, [customers.data, allProducts.data]);

  const qtyNum = Number(quantity);
  const canSubmit = !!(customerId && productId && Number.isFinite(qtyNum) && qtyNum > 0);

  const statusColor = (s: string) =>
    s === 'Completed' ? colors.status.success.fg : s === 'Archived' ? colors.textMuted : colors.status.info.fg;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={orders.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Orders
      </AppText>

      {/* Create order */}
      <Card style={{ marginBottom: spacing(4) }}>
        <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
          Create order
        </AppText>
        {ok ? <Banner tone="success" message={ok} /> : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <Select
          label="Customer"
          value={customerId}
          options={customerOptions}
          onChange={(v) => {
            setCustomerId(v);
            setProductId(null);
          }}
          emptyHint="Create a customer first"
        />
        <Select
          label="Product"
          value={productId}
          options={productOptions}
          onChange={(v) => setProductId(v)}
          placeholder={customerId ? 'Select a product' : 'Select a customer first'}
          emptyHint="Create a product for this customer first"
        />
        <FormField
          label="Order quantity (Sets)"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="e.g. 5200 sets"
          keyboardType="number-pad"
        />
        <Button
          label="Create Order"
          loading={create.isPending}
          disabled={!canSubmit}
          onPress={() => {
            setOk(null);
            create.mutate();
          }}
        />
      </Card>

      {/* Filters */}
      <Card style={{ marginBottom: spacing(4) }}>
        <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
          Filter
        </AppText>
        <Select
          label="Customer"
          value={fCustomerId ?? ''}
          options={filterCustomerOptions}
          onChange={(v) => {
            setFCustomerId(v || null);
            setFProductId(null);
          }}
        />
        <Select
          label="Product"
          value={fProductId ?? ''}
          options={filterProductOptions}
          onChange={(v) => setFProductId(v || null)}
          placeholder={fCustomerId ? 'All products' : 'Select a customer first'}
        />
        <FormField
          label="OrderID"
          value={fOrderCode}
          onChangeText={setFOrderCode}
          placeholder="e.g. FFT-00001"
          autoCapitalize="characters"
        />
        <Select label="Status" value={fStatus} options={STATUS_FILTER_OPTIONS} onChange={(v) => setFStatus(v)} />
      </Card>

      <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
        All orders
      </AppText>
      {lifecycleError ? <Banner tone="danger" message={lifecycleError} /> : null}
      {deleteError ? <Banner tone="danger" message={deleteError} /> : null}
      <QueryBoundary
        isLoading={orders.isLoading}
        isError={orders.isError}
        error={orders.error}
        data={orders.data}
        onRetry={orders.refetch}
      >
        {(d) =>
          d.data.length === 0 ? (
            <AppText tone="muted">No orders match.</AppText>
          ) : (
            <View style={{ gap: spacing(2) }}>
              {d.data.map((o) => {
                const productName = (o.productId && nameMaps.prod.get(o.productId)) || o.productId;
                const customerName = (o.customerId && nameMaps.cust.get(o.customerId)) || o.customerId;
                return (
                  <Card key={o.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText weight="600">{o.orderCode ?? o.id}</AppText>
                      <AppText weight="600" style={{ color: statusColor(o.status) }}>
                        {o.status}
                      </AppText>
                    </View>
                    <AppText variant="caption" tone="muted">
                      {customerName} · {productName} · {o.orderQuantity} sets
                    </AppText>
                    <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                      Production: <AppText weight="600" style={{ color: statusColor(o.productionStatus) }}>{o.productionStatus}</AppText>
                      {'   '}Assembly: <AppText weight="600" style={{ color: statusColor(o.assemblyStatus) }}>{o.assemblyStatus}</AppText>
                    </AppText>

                    <Pressable
                      onPress={() =>
                        navigation.navigate('OrderTimeline', {
                          orderId: o.id,
                          orderCode: o.orderCode ?? o.id,
                        })
                      }
                      style={{ marginTop: spacing(2) }}
                    >
                      <AppText variant="caption" weight="600" style={{ color: colors.primary }}>
                        View Timeline ›
                      </AppText>
                    </Pressable>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: spacing(2) }}>
                      {o.productionStatus !== 'Completed' ? (
                        <Pressable
                          onPress={() =>
                            confirm(
                              'Complete Production',
                              `Complete production for ${o.orderCode ?? 'this order'}? The moulding workspace will clear and its data moves to history. Records are preserved.`,
                              () => lifecycle.mutate({ id: o.id, action: 'production' }),
                            )
                          }
                        >
                          <AppText weight="600" style={{ color: colors.primary }}>Complete Production</AppText>
                        </Pressable>
                      ) : null}
                      {o.assemblyStatus !== 'Completed' ? (
                        <Pressable
                          onPress={() =>
                            confirm(
                              'Complete Assembly',
                              `Complete assembly for ${o.orderCode ?? 'this order'}? The assembly workspace will clear and its data moves to history. Records are preserved.`,
                              () => lifecycle.mutate({ id: o.id, action: 'assembly' }),
                            )
                          }
                        >
                          <AppText weight="600" style={{ color: colors.primary }}>Complete Assembly</AppText>
                        </Pressable>
                      ) : null}
                    </View>

                    {editingId !== o.id && confirmDeleteId !== o.id ? (
                      <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) }}>
                        <Button
                          label="Edit"
                          variant="secondary"
                          onPress={() => {
                            setConfirmDeleteId(null);
                            setEditingId(o.id);
                          }}
                        />
                        <Button
                          label="Delete"
                          variant="danger"
                          onPress={() => {
                            setEditingId(null);
                            setConfirmDeleteId(o.id);
                          }}
                        />
                      </View>
                    ) : null}

                    {editingId === o.id ? <OrderEditPanel order={o} onClose={() => setEditingId(null)} /> : null}

                    {confirmDeleteId === o.id ? (
                      <View style={{ marginTop: spacing(2) }}>
                        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
                          Delete {o.orderCode ?? 'this order'}? This cannot be undone. Orders with production
                          records are protected and cannot be deleted.
                        </AppText>
                        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                          <Button
                            label="Confirm delete"
                            variant="danger"
                            loading={remove.isPending}
                            onPress={() => remove.mutate(o.id)}
                            style={{ flex: 1 }}
                          />
                          <Button
                            label="Cancel"
                            variant="secondary"
                            disabled={remove.isPending}
                            onPress={() => setConfirmDeleteId(null)}
                            style={{ flex: 1 }}
                          />
                        </View>
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
