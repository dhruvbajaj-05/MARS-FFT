import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { outsourcedApi, storeApi } from '@/api/endpoints/store';
import { queryKeys } from '@/api/queryKeys';
import type { ComponentOrderNode, ComponentPart, OutsourcedItem } from '@/api/types';
import { AppText, Banner, Button, Card, FormField, QueryBoundary, Screen, Select } from '@/components';
import { useCurrentUser } from '@/hooks/useAuth';
import { ROLES } from '@/types/roles';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useTheme } from '@/theme/ThemeProvider';
import { useCustomerProduct } from './useCustomerProduct';

// Engineer store viewer.
//   Moulding / Assembly → Component Store. Works exactly like the Records pages:
//     pick Customer → Product → OrderID, then see that ONE order's Pending / Finished /
//     Surplus mold-part rows. Orders are never mixed together.
//   QC / Dispatch       → Finished Goods Store (Customer → Product → Quantity)
// RBAC on the backend matches: component viewers = moulding/assembly, finished = qc/dispatch.

type BucketKind = 'pending' | 'finished' | 'surplus';

// Render the right-hand quantity for a part row.
//   surplus  → +<surplus>                 (overage above the required target)
//   finished → <finished> / <required>     (capped at required — never shows the overage)
//   pending  → <onHand> / <required>       (progress toward the target)
function quantityLabel(part: ComponentPart, kind: BucketKind): string {
  if (kind === 'surplus') return `+${part.surplusQuantity}`;
  const value = kind === 'finished' ? part.finishedQuantity : part.quantityOnHand;
  return `${value}${part.requiredQuantity > 0 ? ` / ${part.requiredQuantity}` : ''}`;
}

// One bucket: a header + a small table of mold rows (Mold · Part · Cavity · qty).
function PartBucket({ title, kind, parts }: { title: string; kind: BucketKind; parts: ComponentPart[] }) {
  const { spacing, colors } = useTheme();
  if (parts.length === 0) return null;
  const tone =
    kind === 'finished' ? colors.status.success.fg : kind === 'surplus' ? colors.status.info.fg : colors.text;
  return (
    <View style={{ marginBottom: spacing(2) }}>
      <AppText variant="caption" tone="muted" style={{ marginBottom: 2 }}>
        {title}
      </AppText>
      {parts.map((part) => (
        <View
          key={part.partName}
          style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: spacing(2), paddingVertical: 2 }}
        >
          <View style={{ flex: 1 }}>
            <AppText weight="600">{part.moldName || part.partName}</AppText>
            <AppText variant="caption" tone="muted">
              {part.partName} · {part.cavity} cavity
            </AppText>
          </View>
          <AppText weight="600" style={{ color: tone }}>
            {quantityLabel(part, kind)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

// The Pending / Finished view for the ONE selected OrderID. Both are scoped to this
// order; Surplus is product-level and rendered separately (outside the OrderID structure).
function OrderBuckets({ order }: { order: ComponentOrderNode }) {
  const { spacing, colors, radius } = useTheme();
  const empty = order.pending.length === 0 && order.finished.length === 0;
  return (
    <View
      style={{
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        padding: spacing(3),
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) }}>
        <AppText variant="caption" tone="muted">
          Total {order.totalQuantity}
        </AppText>
        <AppText weight="700">{order.orderCode ?? 'Order'}</AppText>
      </View>
      <PartBucket title="Pending" kind="pending" parts={order.pending} />
      <PartBucket title="Finished" kind="finished" parts={order.finished} />
      {empty ? <AppText tone="muted" variant="caption">No parts yet for this order.</AppText> : null}
    </View>
  );
}

// Surplus is a SEPARATE, product-level store (over-production accumulated across every
// order for this Customer → Product → Part). It lives outside the OrderID structure and
// is never consumed by assembly.
function SurplusCard({ surplus }: { surplus: ComponentPart[] }) {
  const { spacing } = useTheme();
  if (surplus.length === 0) return null;
  return (
    <Card style={{ marginTop: spacing(3) }}>
      <AppText variant="h3" style={{ marginBottom: spacing(1) }}>
        Surplus
      </AppText>
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
        Over-production for this product, pooled across all orders.
      </AppText>
      <PartBucket title="Available surplus" kind="surplus" parts={surplus} />
    </Card>
  );
}

// One editable outsourced row: name + quantity, with Save (set absolute) + Delete.
// Read-only roles get just the name + quantity.
function OutsourcedRow({
  item,
  scope,
  canEdit,
  onChanged,
}: {
  item: OutsourcedItem;
  scope: 'order' | 'surplus';
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { spacing, colors } = useTheme();
  const [qty, setQty] = useState(String(item.quantityOnHand));

  const save = useMutation({
    mutationFn: () => outsourcedApi.update(item.id, { quantity: Number(qty), scope }),
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: () => outsourcedApi.remove(item.id, scope),
    onSuccess: onChanged,
  });

  if (!canEdit) {
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
        <AppText weight="600">{item.componentName}</AppText>
        <AppText weight="600">{item.quantityOnHand}</AppText>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingVertical: spacing(1) }}>
      <AppText weight="600" style={{ flex: 1 }}>
        {item.componentName}
      </AppText>
      <View style={{ width: 84 }}>
        <FormField label="" value={qty} onChangeText={setQty} keyboardType="number-pad" />
      </View>
      <Pressable
        onPress={() => save.mutate()}
        disabled={save.isPending || qty === '' || Number(qty) < 0}
        style={{ backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingVertical: spacing(1), paddingHorizontal: spacing(2) }}
      >
        <AppText variant="caption" weight="600">Save</AppText>
      </Pressable>
      <Pressable
        onPress={() => del.mutate()}
        disabled={del.isPending}
        style={{ paddingVertical: spacing(1), paddingHorizontal: spacing(2) }}
      >
        <AppText variant="caption" weight="600" style={{ color: colors.status.danger.fg }}>Delete</AppText>
      </Pressable>
    </View>
  );
}

// Outsourced Components: purchased/external parts for the selected OrderID, plus a
// product-level surplus pool. Separate from moulded inventory. Moulding Engineers can
// add / edit / delete / adjust; everyone else is read-only.
function OutsourcedSection({
  customerId,
  productId,
  orderId,
  canEdit,
}: {
  customerId: string;
  productId: string;
  orderId: string;
  canEdit: boolean;
}) {
  const { spacing, colors } = useTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [received, setReceived] = useState('');
  const [perSet, setPerSet] = useState('');
  const [addOk, setAddOk] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.store.outsourced(customerId, productId, orderId),
    queryFn: () => outsourcedApi.list({ customerId, productId, orderId }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.store.outsourced(customerId, productId, orderId) });
    queryClient.invalidateQueries({ queryKey: ['assembly', 'assortment'] });
  };

  // RULE 3 — enter Quantity Received + Per-Set; the server splits into order allocation
  // (orderSets × perSet) and product surplus (the remainder), immediately.
  const add = useMutation({
    mutationFn: () =>
      outsourcedApi.allocate({
        customerId,
        productId,
        orderId,
        componentName: name.trim(),
        received: Number(received),
        perSet: Number(perSet),
      }),
    onSuccess: (a) => {
      setAddOk(`${a.componentName}: ${a.addedToOrder} → order (need ${a.requiredQuantity}), ${a.addedToSurplus} → product surplus.`);
      setName('');
      setReceived('');
      setPerSet('');
      invalidate();
    },
  });

  const addError = add.error instanceof ApiError ? friendlyMessage(add.error) : null;
  const components = query.data?.components ?? [];
  const surplus = query.data?.surplus ?? [];
  const suggestions = query.data?.suggestions ?? [];
  const canAdd = !!name.trim() && received !== '' && Number(received) > 0 && perSet !== '' && Number(perSet) >= 0;

  return (
    <Card style={{ marginTop: spacing(3) }}>
      <AppText variant="h3" style={{ marginBottom: spacing(1) }}>
        Outsourced Components
      </AppText>
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
        Purchased / external parts (axle, sticker sheet, screw pack…). Tracked separately from moulded parts.
      </AppText>

      <AppText variant="caption" tone="muted" style={{ marginBottom: 2 }}>For this order</AppText>
      {components.length === 0 ? (
        <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>None added yet.</AppText>
      ) : (
        <View style={{ marginBottom: spacing(2) }}>
          {components.map((c) => (
            <OutsourcedRow key={c.id} item={c} scope="order" canEdit={canEdit} onChanged={invalidate} />
          ))}
        </View>
      )}

      {surplus.length > 0 ? (
        <View style={{ marginBottom: spacing(2) }}>
          <AppText variant="caption" tone="muted" style={{ marginBottom: 2 }}>Surplus (product-level, pooled across orders)</AppText>
          {surplus.map((c) => (
            <OutsourcedRow key={c.id} item={c} scope="surplus" canEdit={canEdit} onChanged={invalidate} />
          ))}
        </View>
      ) : null}

      {canEdit ? (
        <View style={{ borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing(2) }}>
          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>
            Receive stock — quantity is split automatically: (order sets × per-set) to this order, the rest to product surplus.
          </AppText>
          {addOk ? <Banner tone="success" message={addOk} /> : null}
          {addError ? <Banner tone="danger" message={addError} /> : null}
          {suggestions.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(2) }}>
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setName(s)}
                  style={{ backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingVertical: spacing(1), paddingHorizontal: spacing(2) }}
                >
                  <AppText variant="caption" weight="600">{s}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
          <FormField label="Component name" value={name} onChangeText={setName} placeholder="e.g. Axle" />
          <FormField label="Quantity received" value={received} onChangeText={setReceived} keyboardType="number-pad" placeholder="e.g. 12000" />
          <FormField label="Required per set" value={perSet} onChangeText={setPerSet} keyboardType="number-pad" placeholder="e.g. 2" />
          <Button label="Receive & Allocate" loading={add.isPending} disabled={!canAdd} onPress={() => { setAddOk(null); add.mutate(); }} />
        </View>
      ) : null}
    </Card>
  );
}

// ---- Component Store: Customer → Product → OrderID, then this order's buckets ----
function ComponentStore() {
  const { spacing } = useTheme();
  const user = useCurrentUser();
  const canEditOutsourced = user?.role === ROLES.MOULDING_ENGINEER;
  const cp = useCustomerProduct();
  const { customerId, productId, orderId } = cp;

  const ready = !!customerId && !!productId && !!orderId;
  const params = {
    customerId: customerId ?? undefined,
    productId: productId ?? undefined,
    orderId: orderId ?? undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.store.componentsByOrder(params),
    queryFn: () => storeApi.componentsByOrder(params),
    enabled: ready,
  });

  // With all three filters applied the tree collapses to a single customer → product →
  // order path. Surplus lives on the product node (the order's overage).
  const product = query.data?.customers[0]?.products[0];
  const order = product?.orders.find((o) => o.orderId === orderId) ?? product?.orders[0];

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        Component Store
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Select a customer, product and OrderID to see that order&apos;s Pending, Finished and Surplus parts.
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        <Select
          label="Customer"
          value={customerId}
          options={cp.customerOptions}
          onChange={cp.selectCustomer}
          placeholder="Select a customer…"
        />
        <Select
          label="Product"
          value={productId}
          options={cp.productOptions}
          onChange={cp.selectProduct}
          placeholder={customerId ? 'Select a product…' : 'Select a customer first'}
          emptyHint={customerId ? 'No products for this customer' : 'Select a customer first'}
        />
        <Select
          label="OrderID"
          value={orderId}
          options={cp.orderOptions}
          onChange={(v) => cp.setOrderId(v)}
          placeholder={productId ? 'Select an order…' : 'Select a product first'}
          emptyHint="No orders for this product"
        />
      </Card>

      {!ready ? (
        <AppText tone="muted">Select a customer, product and OrderID to view the component store.</AppText>
      ) : (
        <QueryBoundary
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          data={query.data}
          onRetry={query.refetch}
        >
          {() => (
            <>
              {!order ? (
                <AppText tone="muted">
                  No active components for this order. Submit moulding production first, or the order may be complete.
                </AppText>
              ) : (
                <OrderBuckets order={order} />
              )}
              <SurplusCard surplus={product?.surplus ?? []} />
              <OutsourcedSection
                customerId={customerId!}
                productId={productId!}
                orderId={orderId!}
                canEdit={canEditOutsourced}
              />
            </>
          )}
        </QueryBoundary>
      )}
    </Screen>
  );
}

// ---- Finished Goods Store: Customer → Product → Quantity (QC / Dispatch) ----
function FinishedGoodsStore() {
  const { spacing } = useTheme();
  const query = useQuery({
    queryKey: queryKeys.store.finishedGoods(),
    queryFn: () => storeApi.finishedGoods(),
  });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        Finished Goods Store
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Approved products available to dispatch.
      </AppText>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
      >
        {(d) =>
          d.customers.length === 0 ? (
            <AppText tone="muted">No finished goods yet. Approve units in QC first.</AppText>
          ) : (
            <View style={{ gap: spacing(3) }}>
              {d.customers.map((c) => (
                <Card key={c.customerId ?? c.customer}>
                  <AppText variant="h3">{c.customer ?? 'Unknown customer'}</AppText>
                  <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
                    Total {c.totalQuantity}
                  </AppText>
                  {c.products.map((p) => (
                    <View
                      key={p.productId ?? p.product}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}
                    >
                      <AppText>{p.product ?? 'Unknown product'}</AppText>
                      <AppText weight="600">{p.quantityOnHand}</AppText>
                    </View>
                  ))}
                </Card>
              ))}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}

export function StoreScreen() {
  const user = useCurrentUser();
  const isFinished =
    user?.role === ROLES.QC_ENGINEER || user?.role === ROLES.PACKING_DISPATCH_ENGINEER;

  return isFinished ? <FinishedGoodsStore /> : <ComponentStore />;
}
