import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { mouldingApi } from '@/api/endpoints/moulding';
import { storeApi } from '@/api/endpoints/store';
import { queryKeys } from '@/api/queryKeys';
import type { OrderMold, OrderMoldSuggestion } from '@/api/types';
import {
  AppText,
  Banner,
  Button,
  Card,
  FormField,
  MultiCheckbox,
  Screen,
  Select,
  type SelectOption,
} from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useCustomerProduct } from '@/screens/engineer/useCustomerProduct';
import { useTheme } from '@/theme/ThemeProvider';
import { currentShift, shiftLabel } from '@/utils/shift';

// Moulding Engineer screen (revised workflow):
//   1. Select Customer → Product → Order (Active production only).
//   2. Mould Setup: define molds per order (Mold Name, Part, Cavity, Required Shots).
//   3. Production push: Shots Done + Rejected Shots (shots, not pieces).
//      Good Pieces = (Shots Done − Rejected Shots) × Cavity (req #2).
//      Rejection reasons: multi-select checkboxes (req #3).
//   4. Recovery section (when order is complete): enter recovered good pieces
//      from inspected rejected shots → goes to Product Surplus (req #9).
export function MouldingForm() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const cp = useCustomerProduct({ orderFilter: { productionStatus: 'Active' } });

  // ---- Mould Setup form ----
  const [mMoldName, setMMoldName] = useState('');
  const [mPartName, setMPartName] = useState('');
  const [mCavity, setMCavity] = useState('');
  const [mShots, setMShots] = useState('');
  const [moldOk, setMoldOk] = useState<string | null>(null);
  // When set, the setup form is EDITING this existing mold (name locked as the key).
  const [editingMold, setEditingMold] = useState<string | null>(null);

  // ---- Production push form ----
  const [machineNumber, setMachineNumber] = useState<string | null>(null);
  const [selectedMold, setSelectedMold] = useState<string | null>(null);
  const [shotsDone, setShotsDone] = useState('');
  const [rejectedShots, setRejectedShots] = useState('');
  // Multi-select rejection reasons (req #3)
  const [rejectionReasons, setRejectionReasons] = useState<string[]>([]);
  const [newReasonText, setNewReasonText] = useState('');
  const [ok, setOk] = useState<string | null>(null);

  // ---- Recovery form (after production completion — req #9) ----
  const [showRecovery, setShowRecovery] = useState(false);
  // recoveries: list of { partName, cavity, moldName, goodPieces } keyed by partName
  const [recoveries, setRecoveries] = useState<Record<string, string>>({});
  const [recoveryOk, setRecoveryOk] = useState<string | null>(null);

  const machines = useQuery({
    queryKey: queryKeys.machines({}),
    queryFn: () => masterApi.listMachines(),
  });
  const reasons = useQuery({
    queryKey: queryKeys.rejectionReasons,
    queryFn: () => mouldingApi.rejectionReasons(),
  });
  const orderMolds = useQuery({
    queryKey: queryKeys.orderMolds(cp.orderId ?? 'none'),
    queryFn: () => mouldingApi.orderMolds(cp.orderId!),
    enabled: !!cp.orderId,
  });
  const prodStatus = useQuery({
    queryKey: queryKeys.dept('moulding').status(cp.orderId ?? 'none'),
    queryFn: () => mouldingApi.status(cp.orderId!),
    enabled: !!cp.orderId,
  });
  // Product-level store surplus (pooled across all orders) — shown on the mould setup so the
  // planner can reduce Required Shots by whatever usable inventory already exists.
  const storeSurplus = useQuery({
    queryKey: queryKeys.store.componentsByOrder({
      customerId: cp.customerId ?? undefined,
      productId: cp.productId ?? undefined,
    }),
    queryFn: () => storeApi.componentsByOrder({ customerId: cp.customerId!, productId: cp.productId! }),
    enabled: !!cp.customerId && !!cp.productId,
  });
  const surplusRows =
    storeSurplus.data?.customers?.[0]?.products?.[0]?.surplus?.filter((s) => s.surplusQuantity > 0) ?? [];

  const resetSetupForm = () => {
    setMMoldName('');
    setMPartName('');
    setMCavity('');
    setMShots('');
    setEditingMold(null);
  };

  const saveMold = useMutation({
    mutationFn: () =>
      mouldingApi.upsertOrderMold({
        orderId: cp.orderId!,
        customerId: cp.customerId ?? undefined,
        productId: cp.productId ?? undefined,
        moldName: mMoldName.trim(),
        partName: mPartName.trim(),
        cavity: Number(mCavity),
        requiredShots: mShots === '' ? undefined : Number(mShots),
        // When editing, this is the row's original name so the backend can rename it (req #9).
        originalMoldName: editingMold ?? undefined,
      }),
    onSuccess: (mold) => {
      setMoldOk(`Mold "${mold.moldName}" saved (${mold.partName}, ${mold.cavity} cavity, target ${mold.requiredQuantity}).`);
      resetSetupForm();
      qc.invalidateQueries({ queryKey: queryKeys.orderMolds(cp.orderId!) });
      if (cp.productId) qc.invalidateQueries({ queryKey: queryKeys.molds(cp.productId) });
      // Target (requiredShots) changes re-derive finished/pending/surplus.
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').status(cp.orderId!) });
    },
  });

  // Load an existing mold into the setup form for quick editing. Every field — including the
  // mold NAME — is editable; on save the original name is sent so the backend renames the row
  // (and re-tags its production) instead of creating a duplicate (req #9).
  const editMold = (m: OrderMold) => {
    setMMoldName(m.moldName);
    setMPartName(m.partName);
    setMCavity(String(m.cavity));
    setMShots(m.requiredShots ? String(m.requiredShots) : '');
    setEditingMold(m.moldName);
    setMoldOk(null);
  };

  const submit = useMutation({
    mutationFn: () =>
      mouldingApi.submit({
        orderId: cp.orderId!,
        customerId: cp.customerId!,
        productId: cp.productId!,
        moldName: selectedMold!,
        machineNumber: machineNumber!,
        shotsDone: Number(shotsDone),
        rejectedShots: Number(rejectedShots),
        rejectionReasons: Number(rejectedShots) > 0 ? rejectionReasons : undefined,
        shift: currentShift(),
      }),
    onSuccess: (res) => {
      setOk(
        `Saved (Shift ${res.record.shift}). ${res.record.goodParts} ${res.record.partName} pushed to Component Store.`
      );
      setShotsDone('');
      setRejectedShots('');
      setRejectionReasons([]);
      setNewReasonText('');
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['moulding'] });
      qc.invalidateQueries({ queryKey: queryKeys.rejectionReasons });
      qc.invalidateQueries({ queryKey: queryKeys.orderMolds(cp.orderId!) });
      qc.invalidateQueries({ queryKey: queryKeys.mouldingDashboard });
    },
  });

  const recoverMutation = useMutation({
    mutationFn: () => {
      const moldList = orderMolds.data?.molds ?? [];
      const entries = moldList
        .map((m) => ({
          partName: m.partName,
          moldName: m.moldName,
          cavity: m.cavity,
          goodPieces: Number(recoveries[m.partName] ?? 0),
        }))
        .filter((e) => e.goodPieces > 0);
      return mouldingApi.recover({
        orderId: cp.orderId!,
        productId: cp.productId!,
        customerId: cp.customerId!,
        recoveries: entries,
      });
    },
    onSuccess: (res) => {
      const total = res.recovered.reduce((s, r) => s + r.goodPieces, 0);
      setRecoveryOk(`Recovered ${total} good pieces added to Product Surplus.`);
      setRecoveries({});
      qc.invalidateQueries({ queryKey: ['store'] });
    },
  });

  const machineOptions: SelectOption[] = (machines.data ?? []).map((m) => ({
    label: m.name,
    value: m.name,
    hint: m.category === 'injection' ? 'Injection' : 'Blow',
  }));

  const allReasonOptions = reasons.data ?? [];

  const toggleReason = (r: string) => {
    setRejectionReasons((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const addNewReason = () => {
    const r = newReasonText.trim();
    if (!r) return;
    if (!rejectionReasons.includes(r)) setRejectionReasons((prev) => [...prev, r]);
    if (!allReasonOptions.includes(r)) {
      // Optimistically update cache so it shows immediately everywhere.
      qc.setQueryData(queryKeys.rejectionReasons, (old: string[] | undefined) =>
        old ? [...old, r].sort() : [r]
      );
      // Persist in the background — makes it permanent across all sessions.
      mouldingApi.saveRejectionReason(r)
        .then((updated) => qc.setQueryData(queryKeys.rejectionReasons, updated))
        .catch(() => {});
    }
    setNewReasonText('');
  };

  const moldError = saveMold.error instanceof ApiError ? friendlyMessage(saveMold.error) : null;
  const error = submit.error instanceof ApiError ? friendlyMessage(submit.error) : null;
  const recoverError = recoverMutation.error instanceof ApiError ? friendlyMessage(recoverMutation.error) : null;

  const moldList: OrderMold[] = orderMolds.data?.molds ?? [];
  const suggestions: OrderMoldSuggestion[] = orderMolds.data?.suggestions ?? [];
  const moldOptions: SelectOption[] = moldList.map((m) => ({
    label: m.moldName,
    value: m.moldName,
    hint: `${m.partName} · ${m.cavity} cavity · target ${m.requiredQuantity || 0}`,
  }));

  const adoptSuggestion = (s: OrderMoldSuggestion) => {
    setMMoldName(s.moldName);
    setMPartName(s.partName);
    setMCavity(String(s.cavity));
    setMShots(s.requiredShots ? String(s.requiredShots) : '');
  };

  const activeMold = useMemo(
    () => moldList.find((m) => m.moldName === selectedMold) ?? null,
    [moldList, selectedMold]
  );
  const cavity = activeMold?.cavity ?? 0;
  const shotsNum = Number(shotsDone);
  const rejectedShotsNum = Number(rejectedShots);
  const goodPreview =
    Number.isFinite(shotsNum) && Number.isFinite(rejectedShotsNum) && cavity > 0
      ? (shotsNum - rejectedShotsNum) * cavity
      : null;

  const canSaveMold = !!(cp.orderId && mMoldName.trim() && mPartName.trim() && Number(mCavity) >= 1);

  const canSubmit = !!(
    cp.customerId &&
    cp.productId &&
    cp.orderId &&
    selectedMold &&
    machineNumber &&
    Number.isFinite(shotsNum) &&
    shotsNum >= 0 &&
    Number.isFinite(rejectedShotsNum) &&
    rejectedShotsNum >= 0 &&
    rejectedShotsNum <= shotsNum &&
    goodPreview !== null &&
    goodPreview >= 0
  );

  const isProductionComplete = prodStatus.data?.status === 'Completed';

  return (
    <Screen scroll contentStyle={{ paddingBottom: 200 }} refreshControl={<RefreshControl refreshing={cp.orders.isRefetching} onRefresh={cp.orders.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Moulding
      </AppText>

      {/* Customer → Product → Order */}
      <Card style={{ marginBottom: spacing(4) }}>
        <Select
          label="Customer"
          value={cp.customerId}
          options={cp.customerOptions}
          onChange={(v) => {
            cp.selectCustomer(v);
            setSelectedMold(null);
          }}
          emptyHint="Ask admin to create a customer"
        />
        <Select
          label="Product"
          value={cp.productId}
          options={cp.productOptions}
          onChange={(v) => {
            cp.selectProduct(v);
            setSelectedMold(null);
          }}
          placeholder={cp.customerId ? 'Select a product' : 'Select a customer first'}
        />
        <Select
          label="Order (OrderID)"
          value={cp.orderId}
          options={cp.orderOptions}
          onChange={(v) => {
            cp.setOrderId(v);
            setSelectedMold(null);
          }}
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
        {prodStatus.data ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
            Status: <AppText weight="600">{prodStatus.data.status}</AppText>
          </AppText>
        ) : null}
      </Card>

      {/* Mould Setup (per order) */}
      {cp.orderId && !isProductionComplete ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Mould Setup for this order
          </AppText>

          {/* Current store surplus (product-level, pooled across orders) — so the planner can
              reduce Required Shots by the usable inventory that already exists. */}
          {surplusRows.length > 0 ? (
            <View
              style={{
                backgroundColor: colors.status.info.bg,
                borderRadius: 8,
                padding: spacing(3),
                marginBottom: spacing(3),
              }}
            >
              <AppText variant="caption" weight="700" style={{ color: colors.status.info.fg, marginBottom: spacing(1) }}>
                Current Store Surplus — usable before you produce
              </AppText>
              {surplusRows.map((s) => (
                <View
                  key={`${s.moldName}-${s.partName}`}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}
                >
                  <AppText variant="caption" weight="600">{s.moldName || s.partName}</AppText>
                  <AppText variant="caption" weight="700" style={{ color: colors.status.info.fg }}>
                    Surplus: {s.surplusQuantity.toLocaleString()}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {moldList.length === 0 ? (
            <AppText tone="muted" style={{ marginBottom: spacing(2) }}>
              No molds set up yet. Define one below.
            </AppText>
          ) : (
            <View style={{ marginBottom: spacing(3) }}>
              {moldList.map((m) => {
                const mp = prodStatus.data?.moldProgress?.find((p) => p.moldName === m.moldName);
                const hasProg = mp && m.requiredShots > 0;
                const isEditing = editingMold === m.moldName;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => editMold(m)}
                    style={{
                      paddingVertical: spacing(2),
                      paddingHorizontal: isEditing ? spacing(2) : 0,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      backgroundColor: isEditing ? colors.surfaceAlt : 'transparent',
                      borderRadius: isEditing ? 8 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <AppText weight="600">{m.moldName}</AppText>
                      <AppText tone="muted" variant="caption">
                        {m.partName} · {m.cavity} cav  ·  ✎ edit
                      </AppText>
                    </View>
                    {hasProg ? (
                      <AppText
                        variant="caption"
                        style={{ color: mp.isComplete ? colors.status.success.fg : colors.textMuted, marginTop: 2 }}
                      >
                        {mp.goodParts.toLocaleString()} / {mp.requiredPieces.toLocaleString()} pieces
                        {'  '}({mp.shotsDone.toLocaleString()} / {mp.requiredShots.toLocaleString()} shots)
                        {mp.isComplete ? '  ✓ Done' : ''}
                      </AppText>
                    ) : (
                      <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                        Target: {m.requiredShots} shots × {m.cavity} cav = {m.requiredQuantity} pieces
                      </AppText>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {suggestions.length > 0 ? (
            <View style={{ marginBottom: spacing(3) }}>
              <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>
                Suggestions (from previous orders) — tap to use
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s.moldName}
                    onPress={() => adoptSuggestion(s)}
                    style={{
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: 8,
                      paddingVertical: spacing(1),
                      paddingHorizontal: spacing(2),
                    }}
                  >
                    <AppText variant="caption" weight="600">
                      {s.moldName}
                    </AppText>
                    <AppText variant="caption" tone="muted">
                      {s.partName} · {s.cavity} cav
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {moldOk ? <Banner tone="success" message={moldOk} /> : null}
          {moldError ? <Banner tone="danger" message={moldError} /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
            <AppText variant="caption" tone="muted">
              {editingMold ? `Editing mold "${editingMold}"` : 'Add a new mold (tap a mold above to edit it)'}
            </AppText>
            {editingMold ? (
              <Pressable onPress={resetSetupForm}>
                <AppText variant="caption" weight="600" style={{ color: colors.primary }}>Cancel edit</AppText>
              </Pressable>
            ) : null}
          </View>
          <FormField label="Mold name" value={mMoldName} onChangeText={setMMoldName} placeholder="e.g. MB-01" />
          <FormField label="Part name" value={mPartName} onChangeText={setMPartName} placeholder="e.g. Big Block" />
          <FormField label="Cavity number" value={mCavity} onChangeText={setMCavity} keyboardType="number-pad" placeholder="e.g. 11" />
          <FormField label="Required shots" value={mShots} onChangeText={setMShots} keyboardType="number-pad" placeholder="e.g. 3000" />
          <Button
            label={editingMold ? 'Update Mold' : 'Save Mold'}
            loading={saveMold.isPending}
            disabled={!canSaveMold}
            onPress={() => {
              setMoldOk(null);
              saveMold.mutate();
            }}
          />
        </Card>
      ) : null}

      {/* Production push */}
      {cp.orderId && !isProductionComplete ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Production Push
          </AppText>
          {ok ? <Banner tone="success" message={ok} /> : null}
          {error ? <Banner tone="danger" message={error} /> : null}

          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
            Current shift (from your phone clock):{' '}
            <AppText weight="700" style={{ color: colors.primary }}>Shift {shiftLabel(currentShift())}</AppText>
          </AppText>
          <Select
            label="Machine"
            value={machineNumber}
            options={machineOptions}
            onChange={(v) => setMachineNumber(v)}
            placeholder="Select a machine"
            emptyHint="Ask admin to add machines"
          />
          <Select
            label="Mold"
            value={selectedMold}
            options={moldOptions}
            onChange={(v) => setSelectedMold(v)}
            placeholder="Select a mold"
            emptyHint="Set up a mold above first"
          />

          {activeMold ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                backgroundColor: colors.surfaceAlt,
                borderRadius: 8,
                padding: spacing(3),
                marginBottom: spacing(3),
              }}
            >
              <AppText tone="muted">
                Part: <AppText weight="600">{activeMold.partName}</AppText>
              </AppText>
              <AppText tone="muted">
                Cavity: <AppText weight="600">{activeMold.cavity}</AppText>
              </AppText>
            </View>
          ) : null}

          {/* Shots-based entry (req #2) */}
          <FormField
            label="Total Shots Produced"
            value={shotsDone}
            onChangeText={setShotsDone}
            keyboardType="number-pad"
            placeholder="e.g. 7000"
          />
          <FormField
            label="Rejected Shots"
            value={rejectedShots}
            onChangeText={setRejectedShots}
            keyboardType="number-pad"
            placeholder="e.g. 300"
          />

          {/* Multi-select rejection reasons (req #3) */}
          {Number(rejectedShots) > 0 ? (
            <MultiCheckbox
              label="Defects (select all that apply)"
              options={allReasonOptions}
              selected={rejectionReasons}
              onToggle={toggleReason}
              newEntryValue={newReasonText}
              onNewEntryChange={setNewReasonText}
              onAddNewEntry={addNewReason}
              newEntryPlaceholder="Add new defect…"
            />
          ) : null}

          {/* Good pieces preview (req #2 formula) */}
          {goodPreview !== null ? (
            <Banner
              tone={goodPreview >= 0 ? 'info' : 'danger'}
              persistent
              message={
                goodPreview >= 0
                  ? `Good Pieces = (${shotsNum} − ${rejectedShotsNum}) × ${cavity} = ${goodPreview}`
                  : `Rejected shots exceed total shots`
              }
            />
          ) : null}

          <Button
            label="Submit Production"
            loading={submit.isPending}
            disabled={!canSubmit}
            onPress={() => {
              setOk(null);
              submit.mutate();
            }}
          />
        </Card>
      ) : null}

      {/* Order completed banner + recovery section (req #9) */}
      {cp.orderId && isProductionComplete ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <Banner tone="success" persistent message="Production complete for this order." />
          <Pressable
            onPress={() => setShowRecovery((s) => !s)}
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: 8,
              padding: spacing(3),
              marginTop: spacing(2),
            }}
          >
            <AppText weight="600">
              {showRecovery ? '▾' : '▸'} Recover Good Pieces from Rejected Shots
            </AppText>
            <AppText variant="caption" tone="muted">
              Physically inspect rejected shots and enter recovered good pieces → goes to Product Surplus
            </AppText>
          </Pressable>

          {showRecovery && moldList.length > 0 ? (
            <View style={{ marginTop: spacing(3) }}>
              {recoveryOk ? <Banner tone="success" message={recoveryOk} /> : null}
              {recoverError ? <Banner tone="danger" message={recoverError} /> : null}
              {moldList.map((m) => (
                <FormField
                  key={m.partName}
                  label={`${m.partName} (${m.cavity} cavity) — Good Pieces Recovered`}
                  value={recoveries[m.partName] ?? ''}
                  onChangeText={(v) =>
                    setRecoveries((prev) => ({ ...prev, [m.partName]: v }))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                />
              ))}
              <Button
                label="Submit Recovery"
                loading={recoverMutation.isPending}
                disabled={Object.values(recoveries).every((v) => !v || Number(v) <= 0)}
                onPress={() => {
                  setRecoveryOk(null);
                  recoverMutation.mutate();
                }}
              />
            </View>
          ) : showRecovery ? (
            <AppText tone="muted" style={{ marginTop: spacing(2) }}>
              No molds set up for this order.
            </AppText>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
