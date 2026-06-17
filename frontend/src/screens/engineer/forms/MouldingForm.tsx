import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { mouldingApi } from '@/api/endpoints/moulding';
import { queryKeys } from '@/api/queryKeys';
import type { OrderMold, OrderMoldSuggestion } from '@/api/types';
import {
  AppText,
  Banner,
  Button,
  Card,
  FormField,
  Screen,
  Select,
  type SelectOption,
} from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useCustomerProduct } from '@/screens/engineer/useCustomerProduct';
import { useTheme } from '@/theme/ThemeProvider';

// Moulding Engineer screen (revised, order-centric workflow):
//   1. Select Customer → Product → Order (only orders whose production is still Active
//      appear; the order quantity in sets loads automatically).
//   2. Mould Setup for THIS order: define multiple molds (Mold Name, Part, Cavity,
//      Required Shots). Product-level suggestions can be adopted with one tap; everything
//      stays editable. Required Shots × Cavity is the order's Component Store target.
//   3. Production push: pick Shift / Machine / Mold → Part + Cavity auto-fill → enter
//      Shots Done + Rejected. Good Pieces = Shots × Cavity − Rejected (only good are
//      stocked into THIS order's Component Store bucket).
export function MouldingForm() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const cp = useCustomerProduct({ orderFilter: { productionStatus: 'Active' } });

  // ---- Mould Setup form (per order) ----
  const [mMoldName, setMMoldName] = useState('');
  const [mPartName, setMPartName] = useState('');
  const [mCavity, setMCavity] = useState('');
  const [mShots, setMShots] = useState('');
  const [moldOk, setMoldOk] = useState<string | null>(null);

  // ---- Production push form ----
  const [machineNumber, setMachineNumber] = useState<string | null>(null);
  const [selectedMold, setSelectedMold] = useState<string | null>(null);
  const [shotsDone, setShotsDone] = useState('');
  const [rejected, setRejected] = useState('');
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [ok, setOk] = useState<string | null>(null);

  // Machine Master dropdown (engineers select only) + remembered rejection reasons.
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

  // Production status for the selected order (inspect per OrderID).
  const prodStatus = useQuery({
    queryKey: queryKeys.dept('moulding').status(cp.orderId ?? 'none'),
    queryFn: () => mouldingApi.status(cp.orderId!),
    enabled: !!cp.orderId,
  });

  const resetSetupForm = () => {
    setMMoldName('');
    setMPartName('');
    setMCavity('');
    setMShots('');
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
      }),
    onSuccess: (mold) => {
      setMoldOk(`Mold "${mold.moldName}" saved (${mold.partName}, ${mold.cavity} cavity, target ${mold.requiredQuantity}).`);
      resetSetupForm();
      qc.invalidateQueries({ queryKey: queryKeys.orderMolds(cp.orderId!) });
      if (cp.productId) qc.invalidateQueries({ queryKey: queryKeys.molds(cp.productId) });
    },
  });

  const resolvedReason = rejectReason === '__custom__' ? customReason.trim() : rejectReason || undefined;

  const submit = useMutation({
    mutationFn: () =>
      mouldingApi.submit({
        orderId: cp.orderId!,
        customerId: cp.customerId!,
        productId: cp.productId!,
        moldName: selectedMold!,
        machineNumber: machineNumber!,
        shotsDone: Number(shotsDone),
        rejectedParts: Number(rejected),
        rejectionReason: Number(rejected) > 0 ? resolvedReason : undefined,
      }),
    onSuccess: (res) => {
      setOk(`Saved (Shift ${res.record.shift}). ${res.record.goodParts} ${res.record.partName} pushed to Component Store.`);
      setShotsDone('');
      setRejected('');
      setCustomReason('');
      setRejectReason(null);
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['moulding'] });
      qc.invalidateQueries({ queryKey: queryKeys.rejectionReasons });
      qc.invalidateQueries({ queryKey: queryKeys.orderMolds(cp.orderId!) });
    },
  });

  const machineOptions: SelectOption[] = (machines.data ?? []).map((m) => ({
    label: m.name,
    value: m.name,
    hint: m.category === 'injection' ? 'Injection' : 'Blow',
  }));
  const reasonOptions: SelectOption[] = [
    ...(reasons.data ?? []).map((r) => ({ label: r, value: r })),
    { label: '+ Type a new reason', value: '__custom__' },
  ];

  const moldError = saveMold.error instanceof ApiError ? friendlyMessage(saveMold.error) : null;
  const error = submit.error instanceof ApiError ? friendlyMessage(submit.error) : null;

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

  // Auto-filled values for the selected production mold.
  const activeMold = useMemo(
    () => moldList.find((m) => m.moldName === selectedMold) ?? null,
    [moldList, selectedMold],
  );
  const cavity = activeMold?.cavity ?? 0;
  const shotsNum = Number(shotsDone);
  const rejectedNum = Number(rejected);
  const goodPreview =
    Number.isFinite(shotsNum) && Number.isFinite(rejectedNum) && cavity > 0
      ? shotsNum * cavity - rejectedNum
      : null;

  const canSaveMold = !!(cp.orderId && mMoldName.trim() && mPartName.trim() && Number(mCavity) >= 1);

  const canSubmit = !!(
    cp.customerId &&
    cp.productId &&
    cp.orderId &&
    selectedMold &&
    machineNumber &&
    (Number(rejected) <= 0 || (rejectReason && (rejectReason !== '__custom__' || customReason.trim()))) &&
    Number.isFinite(shotsNum) &&
    shotsNum >= 0 &&
    Number.isFinite(rejectedNum) &&
    rejectedNum >= 0 &&
    goodPreview !== null &&
    goodPreview >= 0
  );

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={cp.orders.isRefetching} onRefresh={cp.orders.refetch} />}>
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
            Production status: <AppText weight="600">{prodStatus.data.status}</AppText> · good{' '}
            {prodStatus.data.goodParts} / {prodStatus.data.orderQuantity} · pending {prodStatus.data.pendingQuantity}
          </AppText>
        ) : null}
      </Card>

      {/* Mould Setup (per order) */}
      {cp.orderId ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Mould Setup for this order
          </AppText>
          {moldList.length === 0 ? (
            <AppText tone="muted" style={{ marginBottom: spacing(2) }}>
              No molds set up yet. Define one below.
            </AppText>
          ) : (
            <View style={{ marginBottom: spacing(3) }}>
              {moldList.map((m) => (
                <View
                  key={m.id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}
                >
                  <AppText weight="600">{m.moldName}</AppText>
                  <AppText tone="muted">
                    {m.partName} · {m.cavity} cav · {m.requiredShots} shots · target {m.requiredQuantity}
                  </AppText>
                </View>
              ))}
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
          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>
            Add / edit a mold (re-using a name overwrites it)
          </AppText>
          <FormField label="Mold name" value={mMoldName} onChangeText={setMMoldName} placeholder="e.g. MB-01" />
          <FormField label="Part name" value={mPartName} onChangeText={setMPartName} placeholder="e.g. Big Block" />
          <FormField label="Cavity number" value={mCavity} onChangeText={setMCavity} keyboardType="number-pad" placeholder="e.g. 11" />
          <FormField label="Required shots" value={mShots} onChangeText={setMShots} keyboardType="number-pad" placeholder="e.g. 3000" />
          <Button
            label="Save Mold"
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
      {cp.orderId ? (
        <Card>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Production Push
          </AppText>
          {ok ? <Banner tone="success" message={ok} /> : null}
          {error ? <Banner tone="danger" message={error} /> : null}

          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
            Shift is detected automatically from the current time.
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
              <AppText tone="muted">Part: <AppText weight="600">{activeMold.partName}</AppText></AppText>
              <AppText tone="muted">Cavity: <AppText weight="600">{activeMold.cavity}</AppText></AppText>
            </View>
          ) : null}

          <FormField label="Shots done" value={shotsDone} onChangeText={setShotsDone} keyboardType="number-pad" placeholder="e.g. 3000" />
          <FormField label="Rejected pieces" value={rejected} onChangeText={setRejected} keyboardType="number-pad" placeholder="e.g. 50" />

          {Number(rejected) > 0 ? (
            <>
              <Select
                label="Rejection reason"
                value={rejectReason}
                options={reasonOptions}
                onChange={(v) => setRejectReason(v)}
                placeholder="Select a reason"
              />
              {rejectReason === '__custom__' ? (
                <FormField
                  label="New reason"
                  value={customReason}
                  onChangeText={setCustomReason}
                  placeholder="e.g. Sink Mark"
                />
              ) : null}
            </>
          ) : null}

          {goodPreview !== null ? (
            <Banner
              tone={goodPreview >= 0 ? 'info' : 'danger'}
              message={
                goodPreview >= 0
                  ? `Good pieces = ${shotsNum} × ${cavity} − ${rejectedNum} = ${goodPreview}`
                  : `Rejected exceeds produced (${shotsNum} × ${cavity} = ${shotsNum * cavity})`
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
    </Screen>
  );
}
