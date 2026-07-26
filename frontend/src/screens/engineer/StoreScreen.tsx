import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { mouldingApi } from '@/api/endpoints/moulding';
import { purchaseOrdersApi } from '@/api/endpoints/purchaseOrders';
import { outsourcedApi, storeApi } from '@/api/endpoints/store';
import { queryKeys } from '@/api/queryKeys';
import type { ComponentPart, OutsourcedItem, OutsourcedReceipt } from '@/api/types';
import { AppText, Banner, Button, Card, FormField, QueryBoundary, Screen, Select } from '@/components';
import { useCurrentUser } from '@/hooks/useAuth';
import { ROLES } from '@/types/roles';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useTheme } from '@/theme/ThemeProvider';
import { usePOItemCode } from './usePOItemCode';

// Engineer store viewer.
//   Moulding / Assembly → Component Store. Works exactly like the Records pages:
//     pick Customer → Product → OrderID, then see that ONE order's Pending / Finished /
//     Surplus mold-part rows. Orders are never mixed together.
//   QC / Dispatch       → Finished Goods Store (Customer → Product → Quantity)
// RBAC on the backend matches: component viewers = moulding/assembly, finished = qc/dispatch.

// One component part row: Mold · Part · Cavity → live on-hand (reduces as assembly consumes),
// shown against its required target when set. Used by the Assembly Component Store.
function ComponentPartRow({ part }: { part: ComponentPart }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ paddingVertical: spacing(2), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <AppText weight="700">{part.moldName || part.partName}</AppText>
          <AppText variant="caption" tone="muted">
            {part.partName} · {part.cavity} cavity
          </AppText>
        </View>
        <AppText weight="700" style={{ color: colors.status.success.fg }}>
          {part.quantityOnHand.toLocaleString()}
          {part.requiredQuantity > 0 ? ` / ${part.requiredQuantity.toLocaleString()}` : ''}
        </AppText>
      </View>
    </View>
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

// ---- Component Store (Assembly): PO → Item Code / PO Cumulative, mirrors the Moulding
// Production Store. Quantities are the LIVE component on-hand that reduces as assembly
// consumes; once an item code's components are fully consumed (assembly done) it drops out of
// the view automatically (the backend removes 0-total orders). View only — no logic change.
function ComponentStore() {
  const { spacing, colors, radius } = useTheme();
  const cp = usePOItemCode({ includeArchivedPOs: true });
  const [tab, setTab] = useState<'item' | 'cumulative' | 'outsourced'>('item');

  // PO item-code identity (orderId → itemCode / product) — the by-order tree lacks item codes.
  const poDetail = useQuery({
    queryKey: queryKeys.purchaseOrder(cp.purchaseOrderId ?? 'none'),
    queryFn: () => purchaseOrdersApi.get(cp.purchaseOrderId!),
    enabled: !!cp.purchaseOrderId,
  });

  // Live component balances for the whole customer (reduce as assembly consumes).
  const compQ = useQuery({
    queryKey: queryKeys.store.componentsByOrder({ customerId: cp.customerId ?? undefined }),
    queryFn: () => storeApi.componentsByOrder({ customerId: cp.customerId! }),
    enabled: !!cp.customerId && tab !== 'outsourced',
  });

  // orderId → its component parts (the tree already omits fully-consumed / done orders).
  const partsByOrder = useMemo(() => {
    const m = new Map<string, ComponentPart[]>();
    for (const c of compQ.data?.customers ?? [])
      for (const p of c.products ?? [])
        for (const o of p.orders ?? [])
          if (o.orderId) m.set(o.orderId, (o.parts ?? []).filter((pt) => pt.quantityOnHand > 0));
    return m;
  }, [compQ.data]);

  // This PO's item codes joined to their live parts. Item codes with nothing left to
  // assemble (all consumed / done) simply have no node and drop out.
  const itemRows = useMemo(() => {
    const jobs = poDetail.data?.jobs ?? [];
    return jobs
      .map((j) => ({ job: j, parts: partsByOrder.get(j.id) ?? [] }))
      .filter((x) => x.parts.length > 0);
  }, [poDetail.data, partsByOrder]);

  // Cumulative: the same physical mould summed across this PO's item codes.
  const cumulative = useMemo(() => {
    const byMould = new Map<
      string,
      { moldName: string; total: number; breakdown: { itemCode: string | null; productName: string | null; onHand: number }[] }
    >();
    for (const { job, parts } of itemRows) {
      for (const part of parts) {
        const key = part.moldName || part.partName;
        if (!byMould.has(key)) byMould.set(key, { moldName: key, total: 0, breakdown: [] });
        const g = byMould.get(key)!;
        g.total += part.quantityOnHand;
        g.breakdown.push({ itemCode: job.itemCode, productName: job.productName, onHand: part.quantityOnHand });
      }
    }
    return [...byMould.values()];
  }, [itemRows]);

  const loading = poDetail.isLoading || compQ.isLoading;

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={cp.refreshing || compQ.isRefetching}
          onRefresh={() => { cp.refetch(); compQ.refetch(); }}
        />
      }
    >
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        Component Store
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Components available to assemble, by item code. Quantities go down as you assemble; an item
        code disappears here once its components are fully consumed.
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        <Select label="Customer" value={cp.customerId} options={cp.customerOptions} onChange={cp.selectCustomer} placeholder="Select a customer…" />
        <Select
          label="Purchase Order"
          value={cp.purchaseOrderId}
          options={cp.purchaseOrderOptions}
          onChange={(v) => cp.selectPurchaseOrder(v)}
          placeholder={cp.customerId ? 'Select a purchase order…' : 'Select a customer first'}
          emptyHint="No purchase orders for this customer"
        />
      </Card>

      {/* Item Code / PO Cumulative / Outsourced toggle (mirrors the Moulding store) */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing(4) }}>
        {([['item', 'Item Code'], ['cumulative', 'PO Cumulative'], ['outsourced', 'Outsourced']] as const).map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1 }}>
              <View style={{ backgroundColor: on ? colors.primary : 'transparent', borderRadius: radius.pill, paddingVertical: spacing(2), alignItems: 'center' }}>
                <AppText weight="700" style={{ color: on ? colors.primaryText : colors.textMuted }}>{label}</AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {!cp.purchaseOrderId ? (
        <AppText tone="muted">Select a customer and purchase order to view the component store.</AppText>
      ) : tab === 'outsourced' ? (
        <View>
          <Card style={{ marginBottom: spacing(3) }}>
            <Select
              label="Item Code"
              value={cp.jobId}
              options={cp.jobOptions}
              onChange={(v) => cp.setJobId(v)}
              placeholder="Select an item code…"
              emptyHint="No item codes in this PO"
            />
          </Card>
          {cp.jobId && cp.customerId && cp.productId ? (
            <OutsourcedSection customerId={cp.customerId} productId={cp.productId} orderId={cp.jobId} canEdit={false} />
          ) : (
            <AppText tone="muted">Select an item code to view its outsourced components.</AppText>
          )}
        </View>
      ) : loading ? (
        <AppText tone="muted">Loading…</AppText>
      ) : tab === 'item' ? (
        itemRows.length === 0 ? (
          <AppText tone="muted">
            No components to assemble in this PO. Item codes disappear here once their components are fully consumed.
          </AppText>
        ) : (
          <View style={{ gap: spacing(3) }}>
            {itemRows.map(({ job, parts }) => (
              <Card key={job.id}>
                <AppText weight="700" style={{ fontSize: 16 }}>{job.itemCode ?? '—'}</AppText>
                <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>{job.productName}</AppText>
                {parts.map((p) => (
                  <ComponentPartRow key={p.partName} part={p} />
                ))}
              </Card>
            ))}
          </View>
        )
      ) : cumulative.length === 0 ? (
        <AppText tone="muted">No components to assemble in this PO.</AppText>
      ) : (
        <View style={{ gap: spacing(3) }}>
          {cumulative.map((m) => (
            <Card key={m.moldName}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText weight="700" style={{ fontSize: 16 }}>{m.moldName}</AppText>
                <AppText weight="700" style={{ color: colors.status.success.fg }}>{m.total.toLocaleString()} pcs</AppText>
              </View>
              <AppText variant="caption" tone="muted" style={{ marginTop: 2, marginBottom: spacing(1) }}>
                Combined across item codes using this mould
              </AppText>
              {m.breakdown.map((b, i) => (
                <View key={`${b.itemCode}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                  <AppText variant="caption">{b.itemCode ?? '—'} · {b.productName}</AppText>
                  <AppText variant="caption" weight="600">{b.onHand.toLocaleString()}</AppText>
                </View>
              ))}
            </Card>
          ))}
        </View>
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

// ---- Production Store (Moulding): two live views by Mould ----
//   Item Code Store  → PO → Item Code → Mould (produced good parts + surplus overage)
//   PO Cumulative    → PO → Mould (same physical mould summed across item codes, traceable)
// Store rows are in PIECES: Required / Good Produced / Remaining (+ Surplus when over target).
function MouldRow({ moldName, produced, surplus, required, remaining, sub }: { moldName: string; produced: number; surplus: number; required?: number; remaining?: number; sub?: string }) {
  const { colors, spacing } = useTheme();
  const done = required !== undefined && required > 0 && produced >= required;
  return (
    <View style={{ paddingVertical: spacing(2), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <AppText weight="700">{moldName}</AppText>
          {sub ? <AppText variant="caption" tone="muted">{sub}</AppText> : null}
        </View>
        <AppText weight="700" style={{ color: done ? colors.status.success.fg : colors.text }}>
          {done ? '✓ Done' : `${(remaining ?? 0).toLocaleString()} left`}
        </AppText>
      </View>
      {/* Pieces breakdown */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginTop: 2 }}>
        <AppText variant="caption" tone="muted">Required {required ? required.toLocaleString() : '—'} pcs</AppText>
        <AppText variant="caption" style={{ color: colors.status.success.fg }}>Good {produced.toLocaleString()} pcs</AppText>
        {required ? <AppText variant="caption" tone="muted">Remaining {(remaining ?? 0).toLocaleString()} pcs</AppText> : null}
        {surplus > 0 ? <AppText variant="caption" style={{ color: colors.status.info.fg }}>Surplus {surplus.toLocaleString()} pcs</AppText> : null}
      </View>
    </View>
  );
}

function ProductionStore() {
  const { spacing, colors, radius } = useTheme();
  const cp = usePOItemCode();
  const [tab, setTab] = useState<'item' | 'cumulative' | 'outsourced'>('item');

  const itemQ = useQuery({
    queryKey: queryKeys.productionStore.itemCode(cp.purchaseOrderId ?? 'none'),
    queryFn: () => mouldingApi.productionStoreItemCode(cp.purchaseOrderId!),
    enabled: !!cp.purchaseOrderId && tab === 'item',
  });
  const cumQ = useQuery({
    queryKey: queryKeys.productionStore.cumulative(cp.purchaseOrderId ?? 'none'),
    queryFn: () => mouldingApi.productionStoreCumulative(cp.purchaseOrderId!),
    enabled: !!cp.purchaseOrderId && tab === 'cumulative',
  });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={cp.refreshing} onRefresh={cp.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>Production Store</AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Good parts produced per mould — per item code, or combined across the PO for shared moulds.
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        <Select label="Customer" value={cp.customerId} options={cp.customerOptions} onChange={cp.selectCustomer} placeholder="Select a customer…" />
        <Select
          label="Purchase Order"
          value={cp.purchaseOrderId}
          options={cp.purchaseOrderOptions}
          onChange={(v) => cp.selectPurchaseOrder(v)}
          placeholder={cp.customerId ? 'Select a purchase order…' : 'Select a customer first'}
          emptyHint="No purchase orders for this customer"
        />
      </Card>

      {/* Three-view toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing(4) }}>
        {([['item', 'Item Code'], ['cumulative', 'PO Cumulative'], ['outsourced', 'Outsourced']] as const).map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1 }}>
              <View style={{ backgroundColor: on ? colors.primary : 'transparent', borderRadius: radius.pill, paddingVertical: spacing(2), alignItems: 'center' }}>
                <AppText weight="700" style={{ color: on ? colors.primaryText : colors.textMuted }}>{label}</AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {!cp.purchaseOrderId ? (
        <AppText tone="muted">Select a customer and purchase order to view production.</AppText>
      ) : tab === 'item' ? (
        <QueryBoundary isLoading={itemQ.isLoading} isError={itemQ.isError} error={itemQ.error} data={itemQ.data} onRetry={itemQ.refetch}>
          {(d) => {
            const withProd = d.items.filter((i) => i.moulds.length > 0);
            return withProd.length === 0 ? (
              <AppText tone="muted">No production recorded yet for this PO.</AppText>
            ) : (
              <View style={{ gap: spacing(3) }}>
                {withProd.map((i) => (
                  <Card key={i.orderId}>
                    <AppText weight="700" style={{ fontSize: 16 }}>{i.itemCode ?? '—'}</AppText>
                    <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>{i.productName}</AppText>
                    {i.moulds.map((m) => (
                      <MouldRow key={m.moldName} moldName={m.moldName} produced={m.produced} surplus={m.surplus} required={m.requiredPieces} remaining={m.remaining} sub={`${m.partName} · ${m.cavity} cav`} />
                    ))}
                  </Card>
                ))}
              </View>
            );
          }}
        </QueryBoundary>
      ) : tab === 'cumulative' ? (
        <QueryBoundary isLoading={cumQ.isLoading} isError={cumQ.isError} error={cumQ.error} data={cumQ.data} onRetry={cumQ.refetch}>
          {(d) =>
            d.moulds.length === 0 ? (
              <AppText tone="muted">No production recorded yet for this PO.</AppText>
            ) : (
              <View style={{ gap: spacing(3) }}>
                {d.moulds.map((m) => (
                  <Card key={m.moldName}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <AppText weight="700" style={{ fontSize: 16 }}>{m.moldName}</AppText>
                      <AppText weight="700" style={{ color: colors.status.success.fg }}>
                        {m.totalProduced.toLocaleString()} good{m.totalSurplus > 0 ? ` · +${m.totalSurplus.toLocaleString()}` : ''}
                      </AppText>
                    </View>
                    <AppText variant="caption" tone="muted" style={{ marginTop: 2, marginBottom: spacing(1) }}>
                      Combined across item codes using this mould
                    </AppText>
                    {m.breakdown.filter((b) => b.produced > 0).map((b) => (
                      <View key={b.orderId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                        <AppText variant="caption">{b.itemCode ?? '—'} · {b.productName}</AppText>
                        <AppText variant="caption" weight="600">{b.produced.toLocaleString()}{b.surplus > 0 ? ` (+${b.surplus.toLocaleString()})` : ''}</AppText>
                      </View>
                    ))}
                  </Card>
                ))}
              </View>
            )
          }
        </QueryBoundary>
      ) : (
        <View>
          <Card style={{ marginBottom: spacing(3) }}>
            <Select
              label="Item Code"
              value={cp.jobId}
              options={cp.jobOptions}
              onChange={(v) => cp.setJobId(v)}
              placeholder="Select an item code…"
              emptyHint="No item codes in this PO"
            />
          </Card>
          {cp.jobId && cp.customerId && cp.productId ? (
            <OutsourcedSection
              customerId={cp.customerId}
              productId={cp.productId}
              orderId={cp.jobId}
              canEdit
            />
          ) : (
            <AppText tone="muted">Select an item code to view and record outsourced components.</AppText>
          )}
        </View>
      )}
    </Screen>
  );
}

export function StoreScreen() {
  const user = useCurrentUser();
  // Moulding engineers get the mould-based Production Store (produced parts by item code /
  // cumulative). Assembly keeps the component store; QC/Dispatch see finished goods.
  if (user?.role === ROLES.MOULDING_ENGINEER) return <ProductionStore />;
  const isFinished =
    user?.role === ROLES.QC_ENGINEER || user?.role === ROLES.PACKING_DISPATCH_ENGINEER;

  return isFinished ? <FinishedGoodsStore /> : <ComponentStore />;
}
