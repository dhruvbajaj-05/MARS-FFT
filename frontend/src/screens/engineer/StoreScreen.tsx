import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { outsourcedApi, storeApi } from '@/api/endpoints/store';
import { queryKeys } from '@/api/queryKeys';
import type { ComponentOrderNode, ComponentPart, OutsourcedItem, OutsourcedReceipt } from '@/api/types';
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

// One BOM/component row: shows the derived Required / On hand / Purchase-need for this
// order. Moulding engineers can edit the per-set value (order-scoped snapshot only).
function OutsourcedComponentRow({
  item,
  canEdit,
  onChanged,
}: {
  item: OutsourcedItem;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { spacing, colors } = useTheme();
  const [per, setPer] = useState(String(item.perSet));
  const dirty = per !== String(item.perSet);

  const save = useMutation({
    mutationFn: () =>
      outsourcedApi.setBom({
        customerId: item.customerId,
        productId: item.productId,
        orderId: item.orderId!,
        componentName: item.componentName,
        perSet: Number(per),
      }),
    onSuccess: onChanged,
  });

  return (
    <View style={{ borderColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing(2) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText weight="700" style={{ flex: 1 }}>{item.componentName}</AppText>
        {item.procurementNeed > 0 ? (
          <AppText weight="700" style={{ color: colors.status.danger.fg }}>Pending {item.procurementNeed}</AppText>
        ) : (
          <AppText weight="700" style={{ color: colors.status.success.fg }}>Complete</AppText>
        )}
      </View>
      {/* Finished / Pending mirror moulding inventory: Finished = received capped at Required,
          Pending = the shortfall still to receive. Surplus is shown product-level below. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: 2 }}>
        <AppText variant="caption" tone="muted">Required {item.requiredQuantity}</AppText>
        <AppText variant="caption" tone="muted">Received {item.received}</AppText>
        <AppText variant="caption" style={{ color: colors.status.success.fg }}>Finished {item.quantityOnHand}</AppText>
        <AppText variant="caption" style={{ color: item.procurementNeed > 0 ? colors.status.danger.fg : colors.textMuted }}>
          Pending {item.procurementNeed}
        </AppText>
      </View>
      {canEdit ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(1) }}>
          <AppText variant="caption" tone="muted">Assortment (per set)</AppText>
          <View style={{ width: 72 }}>
            <FormField label="" value={per} onChangeText={setPer} keyboardType="number-pad" />
          </View>
          {dirty ? (
            <Pressable
              onPress={() => save.mutate()}
              disabled={save.isPending || per === '' || Number(per) < 0}
              style={{ backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingVertical: spacing(1), paddingHorizontal: spacing(2) }}
            >
              <AppText variant="caption" weight="600">Save per-set</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>Assortment {item.perSet} per set</AppText>
      )}
    </View>
  );
}

// One received-stock transaction, with delete (Moulding, within the edit window).
function ReceiptRow({ receipt, canEdit, onChanged }: { receipt: OutsourcedReceipt; canEdit: boolean; onChanged: () => void }) {
  const { spacing, colors } = useTheme();
  const del = useMutation({
    mutationFn: () => outsourcedApi.deleteReceipt(receipt.id),
    onSuccess: onChanged,
  });
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <AppText variant="caption">
          <AppText variant="caption" weight="700">{receipt.componentName}</AppText> +{receipt.quantityReceived}
        </AppText>
        <AppText variant="caption" tone="muted">{new Date(receipt.createdAt).toLocaleString()}</AppText>
      </View>
      {canEdit && receipt.canEdit ? (
        <Pressable onPress={() => del.mutate()} disabled={del.isPending} style={{ paddingVertical: spacing(1), paddingHorizontal: spacing(2) }}>
          <AppText variant="caption" weight="600" style={{ color: colors.status.danger.fg }}>Delete</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

// Outsourced Components: purchased/external parts for the selected OrderID. The BOM is
// auto-populated from the product's master Assortment when the order is created, and is
// editable per order without changing the master. Inventory is transaction-based: each
// receipt is recorded, and Required / On hand / Purchase-need + product surplus are derived
// (existing surplus is consumed before any procurement is required).
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

  // Record a received-stock transaction. perSet is optional — supplied only to (re)set the
  // BOM value for a component that isn't in the order yet. Allocation + procurement are
  // derived server-side (surplus is consumed before procurement).
  const add = useMutation({
    mutationFn: () =>
      outsourcedApi.receive({
        customerId,
        productId,
        orderId,
        componentName: name.trim(),
        quantityReceived: Number(received),
        ...(perSet !== '' ? { perSet: Number(perSet) } : {}),
      }),
    onSuccess: (r) => {
      setAddOk(`Received ${r.quantityReceived} ${r.componentName}.`);
      setName('');
      setReceived('');
      setPerSet('');
      invalidate();
    },
  });

  const addError = add.error instanceof ApiError ? friendlyMessage(add.error) : null;
  const components = query.data?.components ?? [];
  const surplus = query.data?.surplus ?? [];
  const receipts = query.data?.receipts ?? [];
  const suggestions = query.data?.suggestions ?? [];
  const trimmedName = name.trim();
  const canAdd = !!trimmedName && received !== '' && Number(received) > 0;

  return (
    <Card style={{ marginTop: spacing(3) }}>
      <AppText variant="h3" style={{ marginBottom: spacing(1) }}>
        Outsourced Components
      </AppText>
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
        Purchased / external parts (sticker, screw, spring, battery…). Add a component with its
        assortment, then record received quantities. Multiple deliveries add up. Any leftover
        surplus is used by future orders before you need to buy more.
      </AppText>

      {components.length === 0 ? (
        <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
          No outsourced components added to this order yet.
        </AppText>
      ) : (
        <View style={{ marginBottom: spacing(2) }}>
          {components.map((c) => (
            <OutsourcedComponentRow key={c.id} item={c} canEdit={canEdit} onChanged={invalidate} />
          ))}
        </View>
      )}

      {surplus.length > 0 ? (
        <View style={{ marginBottom: spacing(2) }}>
          <AppText variant="caption" tone="muted" style={{ marginBottom: 2 }}>Surplus (product-level, pooled across orders)</AppText>
          {surplus.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
              <AppText weight="600">{c.componentName}</AppText>
              <AppText weight="600" style={{ color: colors.status.info.fg }}>+{c.quantityOnHand}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {canEdit ? (
        <View style={{ borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing(2) }}>
          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>
            Add a component or record a delivery. Deliveries for the same component accumulate.
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
          <FormField label="Component name" value={name} onChangeText={setName} placeholder="e.g. Sticker" />
          <FormField label="Quantity received" value={received} onChangeText={setReceived} keyboardType="number-pad" placeholder="e.g. 5000" />
          <FormField label="Assortment (qty per finished set)" value={perSet} onChangeText={setPerSet} keyboardType="number-pad" placeholder="e.g. 1" />
          <Button label="Save" loading={add.isPending} disabled={!canAdd} onPress={() => { setAddOk(null); add.mutate(); }} />

          {receipts.length > 0 ? (
            <View style={{ marginTop: spacing(3) }}>
              <AppText variant="caption" tone="muted" style={{ marginBottom: 2 }}>Received transactions</AppText>
              {receipts.map((r) => (
                <ReceiptRow key={r.id} receipt={r} canEdit={canEdit} onChanged={invalidate} />
              ))}
            </View>
          ) : null}
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
