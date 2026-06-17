import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { assemblyApi } from '@/api/endpoints/assembly';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Banner, Button, Card, FormField, Screen, Select } from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useCustomerProduct } from '@/screens/engineer/useCustomerProduct';
import { useTheme } from '@/theme/ThemeProvider';

type Row = { partName: string; perSet: string; kind: 'moulded' | 'outsourced' };

// Assembly Engineer screen (revised, order-centric workflow):
//   1. Select Customer → Product → Order (only orders whose assembly is still Active;
//      order quantity loads automatically). See that order's FINISHED components.
//   2. Define the assortment (parts-per-set) — product-level, remembered + editable.
//   3. Enter Assembled Sets → consumption (sets × per-set) is previewed and, on submit,
//      deducted from the order's finished components.
export function AssemblyForm() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const cp = useCustomerProduct({ orderFilter: { assemblyStatus: 'Active' } });

  const [rows, setRows] = useState<Row[]>([]);
  const [rowsKey, setRowsKey] = useState<string | null>(null);
  const [assortOk, setAssortOk] = useState<string | null>(null);

  const [line, setLine] = useState('');
  const [operators, setOperators] = useState('');
  const [sets, setSets] = useState('');
  const [rejected, setRejected] = useState('');
  const [remarks, setRemarks] = useState('');
  const [ok, setOk] = useState<string | null>(null);

  // The selected order's finished components (what we can assemble from).
  const availability = useQuery({
    queryKey: queryKeys.store.componentAvailability(cp.customerId ?? '', cp.productId ?? '', cp.orderId ?? undefined),
    queryFn: () => assemblyApi.availability(cp.customerId!, cp.productId!, cp.orderId!),
    enabled: !!cp.customerId && !!cp.productId && !!cp.orderId,
  });

  const assortment = useQuery({
    queryKey: queryKeys.assortment(cp.customerId ?? '', cp.productId ?? ''),
    queryFn: () => assemblyApi.assortment(cp.customerId!, cp.productId!),
    enabled: !!cp.customerId && !!cp.productId,
  });

  // Assembly status for the selected order (inspect per OrderID).
  const asmStatus = useQuery({
    queryKey: queryKeys.dept('assembly').status(cp.orderId ?? 'none'),
    queryFn: () => assemblyApi.status(cp.orderId!),
    enabled: !!cp.orderId,
  });

  // Seed the editable rows. Prefer the saved assortment; otherwise AUTO-POPULATE the part
  // names from the selected order's FINISHED inventory so the engineer never re-types them
  // (perSet stays blank to fill in). All seeded rows default to 'moulded'; outsourced parts
  // can be added/toggled. Everything remains editable.
  useEffect(() => {
    const key = `${cp.customerId}:${cp.productId}:${cp.orderId}`;
    if (rowsKey === key) return;
    if (assortment.data?.parts.length) {
      setRows(assortment.data.parts.map((p) => ({ partName: p.partName, perSet: String(p.perSet), kind: p.kind ?? 'moulded' })));
      setRowsKey(key);
    } else if (assortment.data && availability.data) {
      const fromFinished = (availability.data.parts ?? []).map((p) => ({ partName: p.partName, perSet: '', kind: 'moulded' as const }));
      setRows(fromFinished.length ? fromFinished : [{ partName: '', perSet: '', kind: 'moulded' }]);
      setRowsKey(key);
    }
  }, [assortment.data, availability.data, cp.customerId, cp.productId, cp.orderId, rowsKey]);

  const saveAssortment = useMutation({
    mutationFn: () =>
      assemblyApi.saveAssortment({
        customerId: cp.customerId!,
        productId: cp.productId!,
        parts: rows
          .filter((r) => r.partName.trim())
          .map((r) => ({ partName: r.partName.trim(), perSet: Number(r.perSet) || 0, kind: r.kind })),
      }),
    onSuccess: (a) => {
      setAssortOk(`Assortment saved (${a.parts.length} parts per set).`);
      qc.invalidateQueries({ queryKey: queryKeys.assortment(cp.customerId!, cp.productId!) });
    },
  });

  const submit = useMutation({
    mutationFn: () =>
      assemblyApi.submit({
        orderId: cp.orderId!,
        customerId: cp.customerId!,
        productId: cp.productId!,
        assemblyLine: line.trim(),
        operatorCount: Number(operators),
        assembledSets: Number(sets),
        rejectedQuantity: Number(rejected),
        remarks: remarks.trim() || undefined,
      }),
    onSuccess: (res) => {
      const extra = res.record.extraSets ?? 0;
      if (res.completion?.completed) {
        setOk(
          `Order complete — required sets assembled${extra > 0 ? ` (+${extra} extra from surplus)` : ''}. ` +
            `Remaining parts moved to Product Surplus; this order has left the active Component Store.`,
        );
      } else {
        setOk(`Assembled ${res.record.assembledSets} sets (Shift ${res.record.shift}). Components deducted from this order.`);
      }
      setSets('');
      setRejected('');
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['assembly'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({
        queryKey: queryKeys.store.componentAvailability(cp.customerId!, cp.productId!, cp.orderId!),
      });
    },
  });

  const assortError = saveAssortment.error instanceof ApiError ? friendlyMessage(saveAssortment.error) : null;
  const error = submit.error instanceof ApiError ? friendlyMessage(submit.error) : null;

  const onHand = useMemo(
    () => new Map((availability.data?.parts ?? []).map((p) => [p.partName, p.quantityOnHand])),
    [availability.data],
  );

  const setsNum = Number.isFinite(Number(sets)) ? Number(sets) : 0;
  // Single input → server splits into order portion + surplus (over-assembly) portion.
  const required = cp.selectedOrder?.orderQuantity ?? 0;
  const alreadyDone = asmStatus.data?.assembledQuantity ?? 0;
  const remainingRequired = Math.max(0, required - alreadyDone);
  const normalSets = Math.min(setsNum, remainingRequired);
  const extraSets = Math.max(0, setsNum - remainingRequired);

  // Consumption preview from the saved assortment. The normal (order) portion of moulded
  // parts is checked against this order's finished inventory; surplus/outsourced portions
  // are validated server-side.
  const consumption = useMemo(() => {
    const parts = assortment.data?.parts ?? [];
    return parts.map((p) => {
      const kind = p.kind ?? 'moulded';
      const need = setsNum * p.perSet;
      const orderNeed = normalSets * p.perSet;
      const have = onHand.get(p.partName) ?? 0;
      const checkable = kind === 'moulded';
      return { partName: p.partName, perSet: p.perSet, kind, need, have, checkable, short: checkable && orderNeed > have };
    });
  }, [assortment.data, setsNum, normalSets, onHand]);

  const anyShort = consumption.some((c) => c.short);
  const hasAssortment = (assortment.data?.parts.length ?? 0) > 0;

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const nums = [operators, sets, rejected].map(Number);
  const canSubmit = !!(
    cp.customerId &&
    cp.productId &&
    cp.orderId &&
    line.trim() &&
    hasAssortment &&
    setsNum > 0 &&
    !anyShort &&
    nums.every((n) => Number.isFinite(n) && n >= 0)
  );

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={cp.orders.isRefetching} onRefresh={cp.orders.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Assembly
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        <Select label="Customer" value={cp.customerId} options={cp.customerOptions} onChange={cp.selectCustomer} />
        <Select
          label="Product"
          value={cp.productId}
          options={cp.productOptions}
          onChange={(v) => cp.selectProduct(v)}
          placeholder={cp.customerId ? 'Select a product' : 'Select a customer first'}
        />
        <Select
          label="Order (OrderID)"
          value={cp.orderId}
          options={cp.orderOptions}
          onChange={(v) => cp.setOrderId(v)}
          placeholder={cp.productId ? 'Select an order' : 'Select a product first'}
          emptyHint="No active orders for this product"
        />
        {cp.selectedOrder ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              backgroundColor: colors.surfaceAlt,
              borderRadius: 8,
              padding: spacing(3),
              marginBottom: spacing(2),
            }}
          >
            <AppText tone="muted">
              Order: <AppText weight="600">{cp.selectedOrder.orderCode ?? '—'}</AppText>
            </AppText>
            <AppText tone="muted">
              Quantity: <AppText weight="600">{cp.selectedOrder.orderQuantity} sets</AppText>
            </AppText>
          </View>
        ) : null}
        {cp.orderId && asmStatus.data ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
            Assembly status: <AppText weight="600">{asmStatus.data.status}</AppText> · assembled{' '}
            {asmStatus.data.assembledQuantity} / {cp.selectedOrder?.orderQuantity ?? '—'} sets
          </AppText>
        ) : null}

        {cp.orderId && availability.data ? (
          <View style={{ marginTop: spacing(2) }}>
            <AppText variant="caption" tone="muted" style={{ marginBottom: 4 }}>
              Finished components available (this order)
            </AppText>
            {availability.data.parts.length === 0 ? (
              <AppText tone="muted">None finished yet — complete moulding targets first.</AppText>
            ) : (
              availability.data.parts.map((p) => (
                <View key={p.partName} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText tone="muted">{p.partName}</AppText>
                  <AppText weight="600">{p.quantityOnHand}</AppText>
                </View>
              ))
            )}
          </View>
        ) : null}
      </Card>

      {/* Assortment editor */}
      {cp.productId ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Assortment — parts per set
          </AppText>
          {assortOk ? <Banner tone="success" message={assortOk} /> : null}
          {assortError ? <Banner tone="danger" message={assortError} /> : null}

          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
            Part names are auto-filled from this order&apos;s finished inventory — set the per-set
            quantity. Tap a part&apos;s tag to switch between Moulded and Outsourced (kept separate).
          </AppText>
          {rows.map((r, i) => (
            <View key={i} style={{ marginBottom: spacing(2) }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2) }}>
                <View style={{ flex: 2 }}>
                  <FormField label="Part" value={r.partName} onChangeText={(v) => updateRow(i, { partName: v })} placeholder="e.g. Big Block" />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField label="Per set" value={r.perSet} onChangeText={(v) => updateRow(i, { perSet: v })} keyboardType="number-pad" placeholder="65" />
                </View>
                <Pressable onPress={() => removeRow(i)} style={{ paddingBottom: spacing(3) + 4 }}>
                  <AppText style={{ color: colors.status.danger.fg }} weight="600">✕</AppText>
                </Pressable>
              </View>
              <Pressable
                onPress={() => updateRow(i, { kind: r.kind === 'moulded' ? 'outsourced' : 'moulded' })}
                style={{ alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingVertical: 2, paddingHorizontal: spacing(2) }}
              >
                <AppText variant="caption" weight="600">
                  {r.kind === 'outsourced' ? 'Outsourced ⇄' : 'Moulded ⇄'}
                </AppText>
              </Pressable>
            </View>
          ))}

          <Pressable onPress={() => setRows((rs) => [...rs, { partName: '', perSet: '', kind: 'moulded' }])} style={{ marginBottom: spacing(3) }}>
            <AppText style={{ color: colors.primary }} weight="600">+ Add part</AppText>
          </Pressable>
          <Button
            label="Save Assortment"
            loading={saveAssortment.isPending}
            disabled={!cp.customerId || !cp.productId || rows.every((r) => !r.partName.trim())}
            onPress={() => {
              setAssortOk(null);
              saveAssortment.mutate();
            }}
          />
        </Card>
      ) : null}

      {/* Assembly entry */}
      {cp.orderId ? (
        <Card>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Assembly Entry
          </AppText>
          {ok ? <Banner tone="success" message={ok} /> : null}
          {error ? <Banner tone="danger" message={error} /> : null}

          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
            Shift is detected automatically from the current time.
          </AppText>
          <FormField label="Assembly line" value={line} onChangeText={setLine} placeholder="e.g. Line 2" />
          <FormField label="Number of workers" value={operators} onChangeText={setOperators} keyboardType="number-pad" placeholder="e.g. 8" />

          <FormField label="Assembled sets" value={sets} onChangeText={setSets} keyboardType="number-pad" placeholder="e.g. 1000" />
          <FormField label="Rejected sets" value={rejected} onChangeText={setRejected} keyboardType="number-pad" placeholder="e.g. 5" />
          <FormField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />

          {extraSets > 0 ? (
            <Banner
              tone="info"
              message={`Over-assembly: ${normalSets} set(s) consume this order, ${extraSets} extra set(s) consume Product Surplus (moulded + outsourced). Surplus must be sufficient or the submission is rejected.`}
            />
          ) : null}

          {!hasAssortment ? (
            <Banner tone="info" message="Define an assortment above before assembling sets." />
          ) : setsNum > 0 ? (
            <View style={{ marginBottom: spacing(3) }}>
              <AppText variant="caption" tone="muted" style={{ marginBottom: 4 }}>
                Consumption for {setsNum} sets{extraSets > 0 ? ` (${normalSets} order + ${extraSets} surplus)` : ''}
              </AppText>
              {consumption.map((c) => (
                <View key={c.partName} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText tone="muted">
                    {c.partName} ({c.kind === 'outsourced' ? 'outsourced' : 'moulded'}; {setsNum} × {c.perSet})
                  </AppText>
                  <AppText weight="600" style={{ color: c.short ? colors.status.danger.fg : colors.text }}>
                    {c.need}{c.checkable ? ` / ${c.have}` : ''}
                  </AppText>
                </View>
              ))}
              {anyShort ? (
                <AppText variant="caption" style={{ color: colors.status.danger.fg, marginTop: 4 }}>
                  Not enough finished stock for the highlighted parts.
                </AppText>
              ) : null}
            </View>
          ) : null}

          <Button
            label="Submit Assembly"
            loading={submit.isPending}
            disabled={!canSubmit}
            onPress={() => {
              setOk(null);
              submit.mutate();
            }}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
