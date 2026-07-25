import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { assemblyApi } from '@/api/endpoints/assembly';
import { purchaseOrdersApi } from '@/api/endpoints/purchaseOrders';
import { storeApi } from '@/api/endpoints/store';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Banner, Button, Card, FormField, Screen, Select } from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { usePOItemCode } from '@/screens/engineer/usePOItemCode';
import { useTheme } from '@/theme/ThemeProvider';
import { currentShift } from '@/utils/shift';

type Row = { partName: string; perSet: string; kind: 'moulded' | 'outsourced' };

// Assembly Engineer screen (Company → PO → Item Code workflow):
//   1. Select Customer → Purchase Order → Item Code (jobs whose assembly is still Active;
//      order quantity loads automatically). See that item code's FINISHED components.
//   2. Define the assortment (parts-per-set) — product-level, remembered + editable.
//   3. Enter Assembled Sets → consumption (sets × per-set) is previewed and, on submit,
//      deducted from the item code's finished components.
export function AssemblyForm() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const cp = usePOItemCode({ jobFilter: (j) => j.assemblyStatus === 'Active', includeArchivedPOs: true });

  const [rows, setRows] = useState<Row[]>([]);
  const [rowsKey, setRowsKey] = useState<string | null>(null);
  const [assortOk, setAssortOk] = useState<string | null>(null);

  const [line, setLine] = useState('');
  const [operators, setOperators] = useState('');
  const [sets, setSets] = useState('');
  const [rejected, setRejected] = useState('');
  const [remarks, setRemarks] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  // Optional record-keeping fields are tucked away — EOD entry only requires Produced Sets.
  const [showDetails, setShowDetails] = useState(false);

  // The selected item code's finished components (what we can assemble from).
  const availability = useQuery({
    queryKey: queryKeys.store.componentAvailability(cp.customerId ?? '', cp.productId ?? '', cp.jobId ?? undefined),
    queryFn: () => assemblyApi.availability(cp.customerId!, cp.productId!, cp.jobId!),
    enabled: !!cp.customerId && !!cp.productId && !!cp.jobId,
  });

  const assortment = useQuery({
    queryKey: queryKeys.assortment(cp.customerId ?? '', cp.productId ?? ''),
    queryFn: () => assemblyApi.assortment(cp.customerId!, cp.productId!),
    enabled: !!cp.customerId && !!cp.productId,
  });

  // Assembly status for the selected item code job.
  const asmStatus = useQuery({
    queryKey: queryKeys.dept('assembly').status(cp.jobId ?? 'none'),
    queryFn: () => assemblyApi.status(cp.jobId!),
    enabled: !!cp.jobId,
  });

  // The moulds the Moulding dept created for this item code — the parts to build the
  // assortment from (req #2). Sourced from the PO detail (accessible to the assembly role) so
  // we never depend on the moulding-only order-molds endpoint. The engineer taps a mould's
  // part to add it as an assortment row.
  const poDetail = useQuery({
    queryKey: queryKeys.purchaseOrder(cp.purchaseOrderId ?? 'none'),
    queryFn: () => purchaseOrdersApi.get(cp.purchaseOrderId!),
    enabled: !!cp.purchaseOrderId,
  });

  // Product-level surplus per part — so the consumption preview can show the normal→surplus
  // cascade (consume this item code's normal store first, then draw from surplus; req #4).
  const surplusQuery = useQuery({
    queryKey: queryKeys.store.componentsByOrder({
      customerId: cp.customerId ?? undefined,
      productId: cp.productId ?? undefined,
    }),
    queryFn: () => storeApi.componentsByOrder({ customerId: cp.customerId!, productId: cp.productId! }),
    enabled: !!cp.customerId && !!cp.productId,
  });

  // Seed the editable rows. Prefer the saved assortment; otherwise AUTO-POPULATE the part
  // names from the selected item code's FINISHED inventory so the engineer never re-types
  // them (perSet stays blank to fill in). All seeded rows default to 'moulded'; outsourced
  // parts can be added/toggled. Everything remains editable.
  useEffect(() => {
    const key = `${cp.customerId}:${cp.productId}:${cp.jobId}`;
    if (rowsKey === key) return;
    if (assortment.data?.parts.length) {
      setRows(assortment.data.parts.map((p) => ({ partName: p.partName, perSet: String(p.perSet), kind: p.kind ?? 'moulded' })));
      setRowsKey(key);
    } else if (assortment.data && availability.data) {
      const fromFinished = (availability.data.parts ?? []).map((p) => ({ partName: p.partName, perSet: '', kind: 'moulded' as const }));
      setRows(fromFinished.length ? fromFinished : [{ partName: '', perSet: '', kind: 'moulded' }]);
      setRowsKey(key);
    }
  }, [assortment.data, availability.data, cp.customerId, cp.productId, cp.jobId, rowsKey]);

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
        orderId: cp.jobId!,
        customerId: cp.customerId!,
        productId: cp.productId!,
        assemblyLine: line.trim(),
        operatorCount: Number(operators),
        assembledSets: Number(sets),
        rejectedQuantity: Number(rejected),
        remarks: remarks.trim() || undefined,
        shift: currentShift(),
      }),
    onSuccess: (res) => {
      const extra = res.record.extraSets ?? 0;
      if (res.completion?.completed) {
        setOk(
          `Item code complete — required sets assembled${extra > 0 ? ` (+${extra} extra from surplus)` : ''}. ` +
            `Remaining parts moved to Product Surplus; this item code has left the active Component Store.`,
        );
      } else {
        setOk(`Assembled ${res.record.assembledSets} sets (Shift ${res.record.shift}). Components deducted from this item code.`);
      }
      setSets('');
      setRejected('');
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['assembly'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({
        queryKey: queryKeys.store.componentAvailability(cp.customerId!, cp.productId!, cp.jobId!),
      });
    },
  });

  const assortError = saveAssortment.error instanceof ApiError ? friendlyMessage(saveAssortment.error) : null;
  const error = submit.error instanceof ApiError ? friendlyMessage(submit.error) : null;

  const onHand = useMemo(
    () => new Map((availability.data?.parts ?? []).map((p) => [p.partName, p.quantityOnHand])),
    [availability.data],
  );
  // Product surplus per part (moulded) — the fallback store the cascade draws from.
  const surplus = useMemo(() => {
    const rows = surplusQuery.data?.customers?.[0]?.products?.[0]?.surplus ?? [];
    return new Map(rows.map((s) => [s.partName, s.surplusQuantity]));
  }, [surplusQuery.data]);

  const setsNum = Number.isFinite(Number(sets)) ? Number(sets) : 0;
  // Sets that count toward the order (for completion) vs any over-assembly beyond it.
  const required = cp.selectedJob?.orderQuantity ?? 0;
  const alreadyDone = asmStatus.data?.assembledQuantity ?? 0;
  const remainingRequired = Math.max(0, required - alreadyDone);
  const extraSets = Math.max(0, setsNum - remainingRequired);

  // Consumption preview (per-part cascade, req #4): each moulded part is consumed from this
  // item code's NORMAL store first, then from product SURPLUS. A part is short only when
  // normal + surplus together cannot cover the total need. Outsourced parts are validated
  // server-side.
  const consumption = useMemo(() => {
    const parts = assortment.data?.parts ?? [];
    return parts.map((p) => {
      const kind = p.kind ?? 'moulded';
      const need = setsNum * p.perSet;
      const have = onHand.get(p.partName) ?? 0;
      const haveSurplus = surplus.get(p.partName) ?? 0;
      const checkable = kind === 'moulded';
      const fromNormal = Math.min(need, have);
      const fromSurplus = Math.max(0, Math.min(need - fromNormal, haveSurplus));
      return {
        partName: p.partName,
        perSet: p.perSet,
        kind,
        need,
        have,
        haveSurplus,
        fromNormal,
        fromSurplus,
        checkable,
        short: checkable && need > have + haveSurplus,
      };
    });
  }, [assortment.data, setsNum, onHand, surplus]);

  const anyShort = consumption.some((c) => c.short);
  const hasAssortment = (assortment.data?.parts.length ?? 0) > 0;

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  // Add a part from a Moulding mould into the assortment (skips duplicates). Req #2.
  const addMouldPart = (partName: string) =>
    setRows((rs) =>
      rs.some((r) => r.partName.trim().toLowerCase() === partName.trim().toLowerCase())
        ? rs
        : [...rs, { partName, perSet: '', kind: 'moulded' }],
    );
  const mouldParts = poDetail.data?.jobs.find((j) => j.id === cp.jobId)?.moulds ?? [];

  const nums = [operators, sets, rejected].map(Number);
  const canSubmit = !!(
    cp.customerId &&
    cp.productId &&
    cp.jobId &&
    hasAssortment &&
    setsNum > 0 &&
    !anyShort &&
    nums.every((n) => Number.isFinite(n) && n >= 0)
  );

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={cp.refreshing} onRefresh={cp.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Assembly
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        <Select label="Customer" value={cp.customerId} options={cp.customerOptions} onChange={cp.selectCustomer} />
        <Select
          label="Purchase Order"
          value={cp.purchaseOrderId}
          options={cp.purchaseOrderOptions}
          onChange={(v) => cp.selectPurchaseOrder(v)}
          placeholder={cp.customerId ? 'Select a purchase order' : 'Select a customer first'}
          emptyHint="No purchase orders for this customer"
        />
        <Select
          label="Item Code"
          value={cp.jobId}
          options={cp.jobOptions}
          onChange={(v) => cp.setJobId(v)}
          placeholder={cp.purchaseOrderId ? 'Select an item code' : 'Select a purchase order first'}
          emptyHint="No active item codes in this PO"
        />
        {cp.selectedJob ? (
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
              Item: <AppText weight="600">{cp.itemCode ?? '—'}</AppText>
            </AppText>
            <AppText tone="muted">
              Quantity: <AppText weight="600">{cp.selectedJob.orderQuantity} sets</AppText>
            </AppText>
          </View>
        ) : null}
        {cp.jobId && asmStatus.data ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
            Assembly status: <AppText weight="600">{asmStatus.data.status}</AppText> · assembled{' '}
            {asmStatus.data.assembledQuantity} / {cp.selectedJob?.orderQuantity ?? '—'} sets
          </AppText>
        ) : null}

        {cp.jobId && availability.data ? (
          <View style={{ marginTop: spacing(2) }}>
            <AppText variant="caption" tone="muted" style={{ marginBottom: 4 }}>
              Finished components available (this item code)
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
            Tap a mould from Moulding below to add its part, then set the per-set quantity. Tap a
            part&apos;s tag to switch between Moulded and Outsourced (kept separate).
          </AppText>

          {/* Moulds created by the Moulding dept for this item code — tap to add the part. */}
          {mouldParts.length > 0 ? (
            <View style={{ marginBottom: spacing(3) }}>
              <AppText variant="caption" weight="700" style={{ color: colors.status.info.fg, marginBottom: spacing(1) }}>
                Moulds from Moulding — tap to add the part
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
                {mouldParts.map((m) => {
                  const added = rows.some(
                    (r) => r.partName.trim().toLowerCase() === m.partName.trim().toLowerCase(),
                  );
                  return (
                    <Pressable
                      key={m.moldName}
                      onPress={() => addMouldPart(m.partName)}
                      disabled={added}
                      style={{
                        backgroundColor: added ? colors.surfaceAlt : colors.status.info.bg,
                        borderRadius: 8,
                        paddingVertical: spacing(1),
                        paddingHorizontal: spacing(2),
                        borderWidth: 1,
                        borderColor: added ? colors.border : colors.status.info.fg,
                      }}
                    >
                      <AppText variant="caption" weight="700" style={{ color: added ? colors.textMuted : colors.status.info.fg }}>
                        {added ? '✓ ' : '+ '}{m.moldName}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        {m.partName} · {m.cavity} cav
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

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

      {/* Assembly entry — End of Day: the engineer only enters Produced Sets (req #3). */}
      {cp.jobId ? (
        <Card>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            End of Day — Produced Sets
          </AppText>
          {ok ? <Banner tone="success" message={ok} /> : null}
          {error ? <Banner tone="danger" message={error} /> : null}

          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
            Enter the sets produced today — components are deducted automatically from the
            assortment (normal store first, then surplus). Shift is detected automatically.
          </AppText>
          <FormField label="Produced sets" value={sets} onChangeText={setSets} keyboardType="number-pad" placeholder="e.g. 100" />

          {extraSets > 0 ? (
            <Banner
              tone="info"
              persistent
              message={`This exceeds the ${remainingRequired} set(s) still required — ${extraSets} extra set(s) are over-assembly and also consume the normal store first, then surplus.`}
            />
          ) : null}

          {!hasAssortment ? (
            <Banner tone="info" persistent message="Define an assortment above before assembling sets." />
          ) : setsNum > 0 ? (
            <View style={{ marginBottom: spacing(3) }}>
              <AppText variant="caption" tone="muted" style={{ marginBottom: 4 }}>
                Components consumed for {setsNum} set{setsNum === 1 ? '' : 's'}
              </AppText>
              {consumption.map((c) => (
                <View key={c.partName} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                  <View style={{ flex: 1 }}>
                    <AppText tone="muted">
                      {c.partName} <AppText variant="caption">({c.kind === 'outsourced' ? 'outsourced' : 'moulded'}; {setsNum} × {c.perSet})</AppText>
                    </AppText>
                    {c.checkable && c.fromSurplus > 0 ? (
                      <AppText variant="caption" style={{ color: colors.status.info.fg }}>
                        {c.fromNormal} from store · {c.fromSurplus} from surplus
                      </AppText>
                    ) : null}
                  </View>
                  <AppText weight="600" style={{ color: c.short ? colors.status.danger.fg : colors.text }}>
                    {c.need}{c.checkable ? ` / ${c.have + c.haveSurplus}` : ''}
                  </AppText>
                </View>
              ))}
              {anyShort ? (
                <AppText variant="caption" style={{ color: colors.status.danger.fg, marginTop: 4 }}>
                  Not enough stock (store + surplus) for the highlighted parts.
                </AppText>
              ) : null}
            </View>
          ) : null}

          {/* Optional record-keeping — hidden by default so EOD entry stays one field. */}
          <Pressable
            onPress={() => setShowDetails((s) => !s)}
            style={{ backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: spacing(3), marginBottom: spacing(3) }}
          >
            <AppText weight="600">{showDetails ? '▾' : '▸'} Details (optional)</AppText>
            <AppText variant="caption" tone="muted">Assembly line, workers, rejected sets, remarks</AppText>
          </Pressable>
          {showDetails ? (
            <View>
              <FormField label="Assembly line" value={line} onChangeText={setLine} placeholder="e.g. Line 2" />
              <FormField label="Number of workers" value={operators} onChangeText={setOperators} keyboardType="number-pad" placeholder="e.g. 8" />
              <FormField label="Rejected sets" value={rejected} onChangeText={setRejected} keyboardType="number-pad" placeholder="e.g. 5" />
              <FormField label="Remarks" value={remarks} onChangeText={setRemarks} multiline />
            </View>
          ) : null}

          <Button
            label="Submit Produced Sets"
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
