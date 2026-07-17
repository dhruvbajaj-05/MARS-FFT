import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { purchaseOrdersApi } from '@/api/endpoints/purchaseOrders';
import { queryKeys } from '@/api/queryKeys';
import type { Paginated, POJob, Product } from '@/api/types';
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

type Rt = { PurchaseOrderDetail: { purchaseOrderId: string; poNumber?: string | null } };

// Inline quantity editor for one item code job.
function JobEditPanel({ job, onClose, onSaved }: { job: POJob; onClose: () => void; onSaved: () => void }) {
  const { spacing } = useTheme();
  const [quantity, setQuantity] = useState(String(job.orderQuantity));
  const save = useMutation({
    mutationFn: () => masterApi.updateOrder(job.id, { orderQuantity: Number(quantity) }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const error = save.error instanceof ApiError ? friendlyMessage(save.error) : null;
  const qtyNum = Number(quantity);
  return (
    <View style={{ marginTop: spacing(2) }}>
      {error ? <Banner tone="danger" message={error} /> : null}
      <FormField label="Order quantity (sets)" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        <Button
          label="Save"
          loading={save.isPending}
          disabled={!Number.isFinite(qtyNum) || qtyNum < 0}
          onPress={() => save.mutate()}
          style={{ flex: 1 }}
        />
        <Button label="Cancel" variant="secondary" disabled={save.isPending} onPress={onClose} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export function PurchaseOrderDetailScreen() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<Rt, 'PurchaseOrderDetail'>>();
  const { purchaseOrderId } = params;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addProductId, setAddProductId] = useState<string | null>(null);
  const [addQty, setAddQty] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: queryKeys.purchaseOrder(purchaseOrderId),
    queryFn: () => purchaseOrdersApi.get(purchaseOrderId),
  });
  const po = detail.data?.purchaseOrder;

  const products = useQuery({
    queryKey: queryKeys.products({ customerId: po?.customerId ?? undefined, limit: 200 }),
    queryFn: () => masterApi.listProducts({ customerId: po!.customerId!, limit: 200 }) as Promise<Paginated<Product>>,
    enabled: !!po?.customerId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.purchaseOrder(purchaseOrderId) });
    qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['admin'] });
  };

  const lifecycle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'production' | 'assembly' }) =>
      action === 'production' ? masterApi.completeProduction(id) : masterApi.completeAssembly(id),
    onSuccess: invalidate,
    onError: (e) => setBanner(e instanceof ApiError ? friendlyMessage(e) : 'Action failed'),
  });

  const addLine = useMutation({
    mutationFn: () => purchaseOrdersApi.addLine(purchaseOrderId, { productId: addProductId!, orderQuantity: Number(addQty) }),
    onSuccess: () => {
      setAddProductId(null);
      setAddQty('');
      invalidate();
    },
    onError: (e) => setBanner(e instanceof ApiError ? friendlyMessage(e) : 'Could not add item code'),
  });

  const removeLine = useMutation({
    mutationFn: (jobId: string) => purchaseOrdersApi.removeLine(purchaseOrderId, jobId),
    onSuccess: invalidate,
    onError: (e) => setBanner(e instanceof ApiError ? friendlyMessage(e) : 'Could not remove item code'),
  });

  const archive = useMutation({
    mutationFn: (status: 'Archived' | 'Open') => purchaseOrdersApi.update(purchaseOrderId, { status }),
    onSuccess: invalidate,
  });

  const deletePO = useMutation({
    mutationFn: () => purchaseOrdersApi.remove(purchaseOrderId),
    onSuccess: () => {
      invalidate();
      navigation.goBack();
    },
    onError: (e) => setBanner(e instanceof ApiError ? friendlyMessage(e) : 'Could not delete purchase order'),
  });

  const confirm = (title: string, message: string, onConfirm: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onConfirm },
    ]);

  const statusColor = (s: string) =>
    s === 'Completed' ? colors.status.success.fg : s === 'Archived' ? colors.textMuted : colors.status.info.fg;

  const productOptions: SelectOption[] = (products.data?.data ?? []).map((p) => ({
    label: p.itemCode ? `${p.itemCode} · ${p.name}` : p.name,
    value: p.id,
  }));

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={detail.refetch} />}>
      <QueryBoundary
        isLoading={detail.isLoading}
        isError={detail.isError}
        error={detail.error}
        data={detail.data}
        onRetry={detail.refetch}
      >
        {(d) => (
          <View>
            {/* PO header */}
            <Card style={{ marginBottom: spacing(4) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="h2">{d.purchaseOrder.poNumber ?? 'Purchase Order'}</AppText>
                <AppText weight="700" style={{ color: statusColor(d.purchaseOrder.status) }}>
                  {d.purchaseOrder.status}
                </AppText>
              </View>
              <AppText tone="muted" style={{ marginTop: 2 }}>
                {d.purchaseOrder.customerName ?? '—'}
                {d.purchaseOrder.jobCount != null ? `  ·  ${d.purchaseOrder.jobCount} item codes` : ''}
              </AppText>
              {d.purchaseOrder.notes ? (
                <AppText variant="caption" tone="muted" style={{ marginTop: spacing(1) }}>
                  {d.purchaseOrder.notes}
                </AppText>
              ) : null}
              {banner ? <View style={{ marginTop: spacing(2) }}><Banner tone="danger" message={banner} /></View> : null}
              <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) }}>
                {d.purchaseOrder.status === 'Archived' ? (
                  <Button label="Unarchive" variant="secondary" loading={archive.isPending} onPress={() => archive.mutate('Open')} style={{ flex: 1 }} />
                ) : (
                  <Button label="Archive" variant="secondary" loading={archive.isPending} onPress={() => archive.mutate('Archived')} style={{ flex: 1 }} />
                )}
                <Button
                  label="Delete PO"
                  variant="danger"
                  loading={deletePO.isPending}
                  onPress={() =>
                    confirm(
                      'Delete purchase order',
                      'This deletes the PO and all its item code jobs. Blocked if any job has production records.',
                      () => deletePO.mutate(),
                    )
                  }
                  style={{ flex: 1 }}
                />
              </View>
            </Card>

            {/* Item code jobs */}
            <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
              Item codes
            </AppText>
            <View style={{ gap: spacing(2) }}>
              {d.jobs.map((job) => (
                <Card key={job.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText weight="700">{job.itemCode ?? job.orderCode ?? job.id}</AppText>
                    <AppText weight="600" style={{ color: statusColor(job.status) }}>{job.status}</AppText>
                  </View>
                  <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    {job.productName ?? '—'} · {job.orderQuantity.toLocaleString()} sets
                  </AppText>
                  <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    Production:{' '}
                    <AppText weight="600" style={{ color: statusColor(job.productionStatus) }}>{job.productionStatus}</AppText>
                    {'   '}Assembly:{' '}
                    <AppText weight="600" style={{ color: statusColor(job.assemblyStatus) }}>{job.assemblyStatus}</AppText>
                  </AppText>

                  <Pressable
                    onPress={() => navigation.navigate('OrderTimeline', { orderId: job.id, orderCode: job.itemCode ?? job.orderCode ?? job.id })}
                    style={{ marginTop: spacing(2) }}
                  >
                    <AppText variant="caption" weight="600" style={{ color: colors.primary }}>View Timeline ›</AppText>
                  </Pressable>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: spacing(2) }}>
                    {job.productionStatus !== 'Completed' ? (
                      <Pressable
                        onPress={() =>
                          confirm(
                            'Complete Production',
                            `Complete production for ${job.itemCode ?? 'this item code'}? Moulding data moves to history; records are preserved.`,
                            () => lifecycle.mutate({ id: job.id, action: 'production' }),
                          )
                        }
                      >
                        <AppText weight="600" style={{ color: colors.primary }}>Complete Production</AppText>
                      </Pressable>
                    ) : null}
                    {job.assemblyStatus !== 'Completed' ? (
                      <Pressable
                        onPress={() =>
                          confirm(
                            'Complete Assembly',
                            `Complete assembly for ${job.itemCode ?? 'this item code'}? Assembly data moves to history; records are preserved.`,
                            () => lifecycle.mutate({ id: job.id, action: 'assembly' }),
                          )
                        }
                      >
                        <AppText weight="600" style={{ color: colors.primary }}>Complete Assembly</AppText>
                      </Pressable>
                    ) : null}
                  </View>

                  {editingId !== job.id ? (
                    <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) }}>
                      <Button label="Edit qty" variant="secondary" onPress={() => setEditingId(job.id)} />
                      <Button
                        label="Remove"
                        variant="danger"
                        loading={removeLine.isPending}
                        onPress={() =>
                          confirm(
                            'Remove item code',
                            `Remove ${job.itemCode ?? 'this item code'} from the PO? Blocked if it has production records.`,
                            () => removeLine.mutate(job.id),
                          )
                        }
                      />
                    </View>
                  ) : (
                    <JobEditPanel job={job} onClose={() => setEditingId(null)} onSaved={invalidate} />
                  )}
                </Card>
              ))}
            </View>

            {/* Add item code */}
            {d.purchaseOrder.status !== 'Archived' ? (
              <Card style={{ marginTop: spacing(4) }}>
                <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
                  Add item code
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2) }}>
                  <View style={{ flex: 2 }}>
                    <Select
                      label="Item code"
                      value={addProductId}
                      options={productOptions}
                      onChange={(v) => setAddProductId(v)}
                      placeholder="Select item code"
                      emptyHint="No item codes for this customer"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormField label="Sets" value={addQty} onChangeText={setAddQty} keyboardType="number-pad" placeholder="e.g. 5000" />
                  </View>
                </View>
                <Button
                  label="Add to PO"
                  loading={addLine.isPending}
                  disabled={!addProductId || !(Number(addQty) > 0)}
                  onPress={() => {
                    setBanner(null);
                    addLine.mutate();
                  }}
                />
              </Card>
            ) : null}
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}
