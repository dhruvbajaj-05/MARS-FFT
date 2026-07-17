import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { purchaseOrdersApi, type PurchaseOrderListParams } from '@/api/endpoints/purchaseOrders';
import { queryKeys } from '@/api/queryKeys';
import type { Customer, Paginated, Product, PurchaseOrderStatus } from '@/api/types';
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

type Line = { productId: string | null; quantity: string };

const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'Open' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Archived', value: 'Archived' },
];

// Admin → Purchase Orders. A PO belongs to one company and groups several independent
// Item Code production jobs. Creating a PO spawns one job per line (each mints its own
// OrderID + reconciles). Tap a PO to manage its item codes.
export function PurchaseOrdersScreen() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const navigation = useNavigation<any>();

  // ---- Create form ----
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([{ productId: null, quantity: '' }]);
  const [notes, setNotes] = useState('');
  const [ok, setOk] = useState<string | null>(null);

  // ---- Filters ----
  const [fCustomerId, setFCustomerId] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<string | null>('');

  const customers = useQuery({
    queryKey: queryKeys.customers({ page: 1, limit: 100 }),
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }) as Promise<Paginated<Customer>>,
  });
  const productParams = { customerId: customerId ?? undefined, limit: 200 };
  const products = useQuery({
    queryKey: queryKeys.products(productParams),
    queryFn: () => masterApi.listProducts(productParams) as Promise<Paginated<Product>>,
    enabled: !!customerId,
  });

  const listParams: PurchaseOrderListParams = {
    limit: 100,
    customerId: fCustomerId ?? undefined,
    status: (fStatus as PurchaseOrderStatus) || undefined,
  };
  const pos = useQuery({
    queryKey: queryKeys.purchaseOrders(listParams),
    queryFn: () => purchaseOrdersApi.list(listParams),
  });

  const create = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.create({
        customerId: customerId!,
        notes: notes.trim() || undefined,
        lines: lines
          .filter((l) => l.productId && Number(l.quantity) > 0)
          .map((l) => ({ productId: l.productId!, orderQuantity: Number(l.quantity) })),
      }),
    onSuccess: (res) => {
      setOk(`${res.purchaseOrder.poNumber} created with ${res.jobs.length} item code${res.jobs.length === 1 ? '' : 's'}.`);
      setLines([{ productId: null, quantity: '' }]);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const error = create.error instanceof ApiError ? friendlyMessage(create.error) : null;

  const customerOptions: SelectOption[] = (customers.data?.data ?? []).map((c) => ({ label: c.name, value: c.id }));
  const filterCustomerOptions: SelectOption[] = [{ label: 'All customers', value: '' }, ...customerOptions];
  const productOptions: SelectOption[] = (products.data?.data ?? []).map((p) => ({
    label: p.itemCode ? `${p.itemCode} · ${p.name}` : p.name,
    value: p.id,
  }));

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { productId: null, quantity: '' }]);
  const removeLine = (i: number) => setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));

  const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
  const canCreate = !!customerId && validLines.length > 0;

  const statusColor = (s: string) =>
    s === 'Completed' ? colors.status.success.fg : s === 'Archived' ? colors.textMuted : colors.status.info.fg;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={pos.isRefetching} onRefresh={pos.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Purchase Orders
      </AppText>

      {/* Create PO */}
      <Card style={{ marginBottom: spacing(4) }}>
        <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
          Create purchase order
        </AppText>
        {ok ? <Banner tone="success" message={ok} /> : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <Select
          label="Customer"
          value={customerId}
          options={customerOptions}
          onChange={(v) => {
            setCustomerId(v);
            setLines([{ productId: null, quantity: '' }]);
          }}
          emptyHint="Create a customer first"
        />

        <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>
          Item codes in this PO
        </AppText>
        {lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2), marginBottom: spacing(1) }}>
            <View style={{ flex: 2 }}>
              <Select
                label="Item code"
                value={l.productId}
                options={productOptions}
                onChange={(v) => updateLine(i, { productId: v })}
                placeholder={customerId ? 'Select item code' : 'Select a customer first'}
                emptyHint="No item codes for this customer"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Sets"
                value={l.quantity}
                onChangeText={(v) => updateLine(i, { quantity: v })}
                keyboardType="number-pad"
                placeholder="e.g. 5000"
              />
            </View>
            <Pressable onPress={() => removeLine(i)} style={{ paddingBottom: spacing(3) + 4 }} disabled={lines.length === 1}>
              <AppText style={{ color: lines.length === 1 ? colors.textMuted : colors.status.danger.fg }} weight="600">
                ✕
              </AppText>
            </Pressable>
          </View>
        ))}
        <Pressable onPress={addLine} style={{ marginBottom: spacing(3) }}>
          <AppText style={{ color: colors.primary }} weight="600">+ Add item code</AppText>
        </Pressable>

        <FormField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. Q3 toy line" />
        <Button
          label={create.isPending ? 'Creating PO…' : 'Create Purchase Order'}
          loading={create.isPending}
          disabled={!canCreate || create.isPending}
          onPress={() => {
            // Hard guard against double-tap: never fire a second request while one is in flight.
            if (create.isPending) return;
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
          onChange={(v) => setFCustomerId(v || null)}
        />
        <Select label="Status" value={fStatus} options={STATUS_FILTER_OPTIONS} onChange={(v) => setFStatus(v)} />
      </Card>

      <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
        All purchase orders
      </AppText>
      <QueryBoundary
        isLoading={pos.isLoading}
        isError={pos.isError}
        error={pos.error}
        data={pos.data}
        onRetry={pos.refetch}
      >
        {(d) =>
          d.data.length === 0 ? (
            <AppText tone="muted">No purchase orders match.</AppText>
          ) : (
            <View style={{ gap: spacing(2) }}>
              {d.data.map((po) => (
                <Pressable
                  key={po.id}
                  onPress={() =>
                    navigation.navigate('PurchaseOrderDetail', { purchaseOrderId: po.id, poNumber: po.poNumber })
                  }
                >
                  <Card>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText weight="700">{po.poNumber ?? po.id}</AppText>
                      <AppText weight="600" style={{ color: statusColor(po.status) }}>
                        {po.status}
                      </AppText>
                    </View>
                    <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                      {po.customerName ?? '—'}
                    </AppText>
                    <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                      {po.jobCount ?? 0} item code{po.jobCount === 1 ? '' : 's'}
                      {po.completedJobs != null && po.jobCount ? `  ·  ${po.completedJobs}/${po.jobCount} done` : ''}
                      {po.totalQuantity != null ? `  ·  ${po.totalQuantity.toLocaleString()} sets` : ''}
                    </AppText>
                    <AppText variant="caption" weight="600" style={{ color: colors.primary, marginTop: spacing(2) }}>
                      Manage item codes ›
                    </AppText>
                  </Card>
                </Pressable>
              ))}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
