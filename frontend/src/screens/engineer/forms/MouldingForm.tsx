import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { mouldingApi } from '@/api/endpoints/moulding';
import { storeApi } from '@/api/endpoints/store';
import { queryKeys } from '@/api/queryKeys';
import type { CompanyMoldSuggestion, OrderMold } from '@/api/types';
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
import { useMouldingSession } from '@/features/moulding/MouldingSessionContext';
import { usePOItemCode } from '@/screens/engineer/usePOItemCode';
import { useTheme } from '@/theme/ThemeProvider';
import { SHIFT_OPTIONS, type Shift } from '@/utils/shift';

// Moulding Engineer screen (Company → PO → Item Code workflow):
//   1. Select Customer → Purchase Order → Item Code (active production jobs only).
//   2. Mould Setup: define molds per item code (Mold Name, Part, Cavity, Required Shots).
//   3. Production push: Shots Done + Rejected Shots (shots, not pieces).
//      Good Pieces = (Shots Done − Rejected Shots) × Cavity (req #2).
//   4. Recovery section (when the item code is complete): recovered good pieces → Surplus.
export function MouldingForm() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const { setActive } = useMouldingSession();
  const cp = usePOItemCode({ jobFilter: (j) => j.productionStatus === 'Active' });

  // Share the selected Item Code job with the QC tab so the engineer never re-selects
  // Company → PO → Item Code to report a defect (req #2).
  useEffect(() => {
    if (cp.jobId && cp.customerId && cp.productId) {
      setActive({
        customerId: cp.customerId,
        productId: cp.productId,
        orderId: cp.jobId,
        purchaseOrderId: cp.purchaseOrderId,
        poNumber: cp.selectedPO?.poNumber ?? null,
        itemCode: cp.itemCode,
        customerName: cp.customerOptions.find((o) => o.value === cp.customerId)?.label ?? null,
        productName: cp.selectedJob?.productName ?? null,
        orderCode: cp.selectedJob?.orderCode ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp.jobId, cp.customerId, cp.productId, cp.purchaseOrderId, cp.itemCode]);

  // ---- Mould Setup form ----
  const [mMoldName, setMMoldName] = useState('');
  const [mPartName, setMPartName] = useState('');
  const [mCavity, setMCavity] = useState('');
  const [mShots, setMShots] = useState('');
  const [moldOk, setMoldOk] = useState<string | null>(null);
  // Set when Save is refused locally because the mould name is already set up on this item
  // code — saving would silently overwrite that setup (its part/cavity/shots), so we never do.
  const [moldDupError, setMoldDupError] = useState<string | null>(null);
  // When set, the setup form is EDITING this existing mold (name locked as the key).
  const [editingMold, setEditingMold] = useState<string | null>(null);

  // ---- Production push form ----
  const [machineNumber, setMachineNumber] = useState<string | null>(null);
  const [selectedMold, setSelectedMold] = useState<string | null>(null);
  // Shift is chosen MANUALLY by the engineer from a dropdown (A/B/C) — never auto-detected.
  const [shift, setShift] = useState<Shift | null>(null);
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
    queryKey: queryKeys.orderMolds(cp.jobId ?? 'none'),
    queryFn: () => mouldingApi.orderMolds(cp.jobId!),
    enabled: !!cp.jobId,
  });
  const prodStatus = useQuery({
    queryKey: queryKeys.dept('moulding').status(cp.jobId ?? 'none'),
    queryFn: () => mouldingApi.status(cp.jobId!),
    enabled: !!cp.jobId,
  });
  // Product-level store surplus (pooled across all jobs) — shown on the mould setup so the
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

  // ---- Surplus (auto-moved from over-production), shown right on the entry page ----
  // The Entry page works in SHOTS, so surplus is shown in SHOTS here (the Store page shows the
  // same surplus in PIECES). Both are DERIVED from the moulding records server-side:
  //   • THIS item code — good-shot surplus per mould, from the live production status.
  //   • CUMULATIVE — the SAME physical mould pooled across every item code in this PO.
  const cumulativeStore = useQuery({
    queryKey: queryKeys.productionStore.cumulative(cp.purchaseOrderId ?? 'none'),
    queryFn: () => mouldingApi.productionStoreCumulative(cp.purchaseOrderId!),
    enabled: !!cp.purchaseOrderId,
  });
  const itemSurplusMoulds = (prodStatus.data?.moldProgress ?? []).filter((m) => m.surplusShots > 0);
  const itemSurplusTotalShots = itemSurplusMoulds.reduce((s, m) => s + m.surplusShots, 0);
  const cumulativeSurplusMoulds = (cumulativeStore.data?.moulds ?? []).filter((m) => m.totalSurplusShots > 0);

  const resetSetupForm = () => {
    setMMoldName('');
    setMPartName('');
    setMCavity('');
    setMShots('');
    setEditingMold(null);
    setMoldDupError(null);
  };

  const saveMold = useMutation({
    mutationFn: () =>
      mouldingApi.upsertOrderMold({
        orderId: cp.jobId!,
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
      qc.invalidateQueries({ queryKey: queryKeys.orderMolds(cp.jobId!) });
      if (cp.productId) qc.invalidateQueries({ queryKey: queryKeys.molds(cp.productId) });
      // Target (requiredShots) changes re-derive finished/pending/surplus.
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').status(cp.jobId!) });
    },
  });

  // Delete a wrongly set-up mould from this item code. The backend blocks the delete once
  // production has been pushed under the mould, so history/store balances are never orphaned.
  const deleteMold = useMutation({
    mutationFn: (moldId: string) => mouldingApi.deleteOrderMold(moldId),
    onSuccess: () => {
      setMoldOk('Mould deleted.');
      resetSetupForm();
      qc.invalidateQueries({ queryKey: queryKeys.orderMolds(cp.jobId!) });
      if (cp.productId) qc.invalidateQueries({ queryKey: queryKeys.molds(cp.productId) });
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').status(cp.jobId!) });
    },
  });

  // Company-wide HARD delete from the "Reuse a mould from this company" dropdown: erases the
  // mould from every item code of this company AND from the learned-mould memory. Nothing is
  // left in the database. Server blocks it once production has been pushed under the mould.
  const deleteCompanyMold = useMutation({
    mutationFn: (moldName: string) =>
      mouldingApi.deleteCompanyMold({ customerId: cp.customerId!, moldName }),
    onSuccess: (res) => {
      setMoldOk(`Mould "${res.moldName}" deleted.`);
      resetSetupForm();
      qc.invalidateQueries({ queryKey: ['moulding', 'order-molds'] });
      if (cp.productId) qc.invalidateQueries({ queryKey: queryKeys.molds(cp.productId) });
      qc.invalidateQueries({ queryKey: ['store'] });
      if (cp.jobId) qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').status(cp.jobId) });
    },
  });

  const confirmDeleteCompanyMold = (s: CompanyMoldSuggestion) => {
    Alert.alert(
      'Delete mould?',
      `Delete "${s.moldName}" (${s.partName}, ${s.cavity} cavity) from this company?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setMoldOk(null);
            deleteCompanyMold.reset();
            deleteCompanyMold.mutate(s.moldName);
          },
        },
      ]
    );
  };

  // Confirm before removing (the mould setup drives production targets), then delete.
  const confirmDeleteMold = (m: OrderMold) => {
    Alert.alert(
      'Delete mould?',
      `Remove "${m.moldName}" (${m.partName}, ${m.cavity} cavity) from this item code? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setMoldOk(null);
            deleteMold.mutate(m.id);
          },
        },
      ]
    );
  };

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
    setMoldDupError(null);
  };

  const submit = useMutation({
    mutationFn: () =>
      mouldingApi.submit({
        orderId: cp.jobId!,
        customerId: cp.customerId!,
        productId: cp.productId!,
        moldName: selectedMold!,
        machineNumber: machineNumber!,
        shotsDone: Number(shotsDone),
        rejectedShots: Number(rejectedShots),
        rejectionReasons: Number(rejectedShots) > 0 ? rejectionReasons : undefined,
        shift: shift!,
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
      qc.invalidateQueries({ queryKey: queryKeys.orderMolds(cp.jobId!) });
      qc.invalidateQueries({ queryKey: queryKeys.mouldingDashboard });
      // Reflect Item Code Done / PO auto-archive on the dashboard immediately (no manual refresh).
      qc.invalidateQueries({ queryKey: queryKeys.mouldingPoDashboard });
      qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').status(cp.jobId!) });
      if (cp.purchaseOrderId) qc.invalidateQueries({ queryKey: queryKeys.purchaseOrder(cp.purchaseOrderId) });
    },
    onError: () => {
      // If the mould locked between load and submit, pull fresh status so it flips to ✓ Done
      // (and the surplus shows) instead of leaving a stale, submittable form.
      qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').status(cp.jobId!) });
      qc.invalidateQueries({ queryKey: ['moulding'] });
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
        orderId: cp.jobId!,
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
  const deleteMoldError = deleteMold.error instanceof ApiError ? friendlyMessage(deleteMold.error) : null;
  const deleteCompanyMoldError =
    deleteCompanyMold.error instanceof ApiError ? friendlyMessage(deleteCompanyMold.error) : null;
  // The mould-completion lock is NOT an error the engineer did anything wrong — it means the
  // mould already hit its target and its overage is now surplus. Surface it as a calm "Done"
  // message, never a red failure. Any OTHER submit error stays as a plain notice (no red).
  const submitApiError = submit.error instanceof ApiError ? submit.error : null;
  const moldAlreadyComplete = submitApiError?.code === 'mould_completed';
  const error = submitApiError && !moldAlreadyComplete ? friendlyMessage(submitApiError) : null;
  const recoverError = recoverMutation.error instanceof ApiError ? friendlyMessage(recoverMutation.error) : null;

  const moldList: OrderMold[] = orderMolds.data?.molds ?? [];
  const moldOptions: SelectOption[] = moldList.map((m) => {
    const mp = prodStatus.data?.moldProgress?.find((p) => p.moldName === m.moldName);
    if (mp?.isComplete) {
      return {
        label: `${m.moldName}  ✓ Done`,
        value: m.moldName,
        hint: `Complete · locked${mp.surplusShots > 0 ? ` · surplus ${mp.surplusShots.toLocaleString()} shots` : ''}`,
      };
    }
    return {
      label: m.moldName,
      value: m.moldName,
      hint: `${m.partName} · ${m.cavity} cavity · target ${(m.requiredShots || 0).toLocaleString()} shots`,
    };
  });

  // Company-wide mould picker: every mould set up anywhere for this company, in one dropdown,
  // so the same physical mould can be reused on any item code without re-typing it. Selecting
  // one fills the setup form (identity + part + cavity); the engineer just sets Required Shots
  // and saves — leaving it a normal per-item-code Mould Setup.
  const companySuggestions: CompanyMoldSuggestion[] = orderMolds.data?.companySuggestions ?? [];
  const companyMoldOptions: SelectOption[] = companySuggestions.map((s) => ({
    label: s.moldName,
    value: s.moldName,
    hint: `${s.partName} · ${s.cavity} cav`,
  }));
  const adoptCompanySuggestion = (s: CompanyMoldSuggestion) => {
    setMMoldName(s.moldName);
    setMPartName(s.partName);
    setMCavity(String(s.cavity));
    setMShots('');
    setEditingMold(null);
    setMoldOk(null);
    setMoldDupError(null);
  };

  const activeMold = useMemo(
    () => moldList.find((m) => m.moldName === selectedMold) ?? null,
    [moldList, selectedMold]
  );
  const shotsNum = Number(shotsDone);
  const rejectedShotsNum = Number(rejectedShots);
  // Entry page works in SHOTS. Good shots for THIS entry = total − rejected (rejected never count).
  const goodShotsThisEntry =
    Number.isFinite(shotsNum) && Number.isFinite(rejectedShotsNum)
      ? shotsNum - rejectedShotsNum
      : null;

  // Per-(item code, mould) progress toward the target, measured in GOOD SHOTS (rejected shots
  // do NOT count). The target is a PLAN, never a cap: an entry is ALWAYS accepted in full, even
  // when its good shots overshoot. The single entry that reaches/crosses the target completes
  // the mould and its good overage flows to Surplus; only AFTER that is the mould locked.
  const selectedMoldProgress = prodStatus.data?.moldProgress?.find((m) => m.moldName === selectedMold);
  const targetShots = activeMold?.requiredShots ?? 0;
  const doneShots = selectedMoldProgress?.goodShots ?? 0;
  const remainingShots = targetShots > 0 ? Math.max(0, targetShots - doneShots) : null;
  // Mould already at/over its good-shot target → complete and locked for this item code.
  const moldLocked = remainingShots !== null && remainingShots === 0;
  // This entry's good shots reach/cross the target: fully accepted, excess good shots → Surplus.
  const completesMould =
    remainingShots !== null && remainingShots > 0 && goodShotsThisEntry !== null && goodShotsThisEntry >= remainingShots;
  // Good shots produced beyond the target → surplus (in shots on the entry page).
  const surplusShots = completesMould ? Math.max(0, goodShotsThisEntry! - remainingShots!) : 0;

  const canSaveMold = !!(cp.jobId && mMoldName.trim() && mPartName.trim() && Number(mCavity) >= 1);

  const canSubmit = !!(
    cp.customerId &&
    cp.productId &&
    cp.jobId &&
    selectedMold &&
    machineNumber &&
    shift &&
    Number.isFinite(shotsNum) &&
    shotsNum >= 0 &&
    Number.isFinite(rejectedShotsNum) &&
    rejectedShotsNum >= 0 &&
    rejectedShotsNum <= shotsNum &&
    goodShotsThisEntry !== null &&
    goodShotsThisEntry >= 0 &&
    // Locked once the mould has reached its good-shot target — no further entries accepted.
    !moldLocked
  );

  const isProductionComplete = prodStatus.data?.status === 'Completed';

  return (
    <Screen scroll contentStyle={{ paddingBottom: 200 }} refreshControl={<RefreshControl refreshing={cp.refreshing} onRefresh={cp.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Moulding
      </AppText>

      {/* Customer → Purchase Order → Item Code */}
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
          label="Purchase Order"
          value={cp.purchaseOrderId}
          options={cp.purchaseOrderOptions}
          onChange={(v) => {
            cp.selectPurchaseOrder(v);
            setSelectedMold(null);
          }}
          placeholder={cp.customerId ? 'Select a purchase order' : 'Select a customer first'}
          emptyHint="No purchase orders for this customer"
        />
        {/* Big PO box — same look as the Item Code box below, so the engineer is never in doubt
            which PO they are working on. Shown the moment a PO is picked. */}
        {cp.selectedPO ? (
          <View
            style={{
              backgroundColor: colors.status.info.bg,
              borderWidth: 2,
              borderColor: colors.status.info.fg,
              borderRadius: 12,
              padding: spacing(3),
              marginBottom: spacing(3),
            }}
          >
            <AppText variant="caption" weight="700" tone="muted">PURCHASE ORDER</AppText>
            <AppText weight="800" style={{ fontSize: 34, color: colors.status.info.fg }}>
              {cp.selectedPO.poNumber ?? cp.selectedPO.id}
            </AppText>
            <AppText weight="600" style={{ marginTop: 2 }}>
              {cp.customerOptions.find((o) => o.value === cp.customerId)?.label ?? '—'}
            </AppText>
          </View>
        ) : null}
        <Select
          label="Item Code"
          value={cp.jobId}
          options={cp.jobOptions}
          onChange={(v) => {
            cp.setJobId(v);
            setSelectedMold(null);
          }}
          placeholder={cp.purchaseOrderId ? 'Select an item code' : 'Select a purchase order first'}
          emptyHint="No active item codes in this PO"
        />
        {cp.selectedJob ? (
          <View
            style={{
              backgroundColor: colors.status.info.bg,
              borderRadius: 12,
              padding: spacing(3),
            }}
          >
            <AppText variant="caption" weight="700" tone="muted">
              ITEM CODE{cp.selectedPO ? `  ·  PO ${cp.selectedPO.poNumber ?? cp.selectedPO.id}` : ''}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <AppText weight="800" style={{ fontSize: 34, color: colors.status.info.fg }}>
                {cp.itemCode ?? '—'}
              </AppText>
              <AppText tone="muted">
                <AppText weight="700">{cp.selectedJob.orderQuantity}</AppText> sets
              </AppText>
            </View>
            <AppText weight="600" style={{ marginTop: 2 }}>
              {cp.selectedJob.partName ?? cp.selectedJob.productName ?? '—'}
            </AppText>
          </View>
        ) : null}
        {prodStatus.data ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
            Status: <AppText weight="600">{prodStatus.data.status}</AppText>
          </AppText>
        ) : null}
      </Card>

      {/* Mould Setup (per item code) */}
      {cp.jobId && !isProductionComplete ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <AppText variant="h3">
            Mould Setup for this item code
          </AppText>
          {/* Repeat the PO + item code here so the context is still visible once the selectors
              have scrolled off the top of the screen. */}
          <AppText variant="caption" weight="700" style={{ color: colors.primary, marginBottom: spacing(2) }}>
            PO {cp.selectedPO?.poNumber ?? cp.selectedPO?.id ?? '—'}  ·  Item code {cp.itemCode ?? '—'}
          </AppText>

          {/* Current store surplus (product-level, pooled across jobs) — so the planner can
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
              {surplusRows.map((s) => {
                // Entry page is in SHOTS: convert the store's surplus pieces back to shots (÷ cavity).
                const surplusShotsAvail = s.cavity > 0 ? Math.floor(s.surplusQuantity / s.cavity) : 0;
                return (
                  <View
                    key={`${s.moldName}-${s.partName}`}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}
                  >
                    <AppText variant="caption" weight="600">{s.moldName || s.partName}</AppText>
                    <AppText variant="caption" weight="700" style={{ color: colors.status.info.fg }}>
                      Surplus: {surplusShotsAvail.toLocaleString()} shots
                    </AppText>
                  </View>
                );
              })}
            </View>
          ) : null}

          {moldList.length === 0 ? (
            <AppText tone="muted" style={{ marginBottom: spacing(2) }}>
              No moulds set up yet. Define one below.
            </AppText>
          ) : (
            <View style={{ marginBottom: spacing(3) }}>
              <AppText variant="caption" weight="700" tone="muted" style={{ marginBottom: spacing(2) }}>
                MOULDS SET UP ({moldList.length})
              </AppText>
              {moldList.map((m) => {
                const mp = prodStatus.data?.moldProgress?.find((p) => p.moldName === m.moldName);
                const hasProg = mp && m.requiredShots > 0;
                const isEditing = editingMold === m.moldName;
                const isDone = !!(hasProg && mp.isComplete);
                // Plain-language status so anyone reading the card knows where this mould stands.
                const statusLabel = isDone
                  ? '✓ Done'
                  : hasProg && mp.displayShots > 0
                    ? 'In progress'
                    : 'Not started';
                const statusTone = isDone ? colors.status.success : hasProg && mp.displayShots > 0 ? colors.status.info : colors.status.neutral;
                // Labelled fact rows — every value the engineer entered in the setup, spelled out.
                const facts: Array<{ label: string; value: string; color?: string }> = [
                  { label: 'Part name', value: m.partName },
                  { label: 'Cavity', value: `${m.cavity} cavity` },
                  { label: 'Required shots', value: `${(m.requiredShots || 0).toLocaleString()} good shots` },
                  {
                    label: 'Required quantity',
                    value: `${((m.requiredShots || 0) * (m.cavity || 0)).toLocaleString()} pieces`,
                  },
                ];
                if (hasProg) {
                  // Entry page is in SHOTS: good shots / target, capped at 100% with ✓ Done.
                  // The overage is reported separately as Surplus (in shots here).
                  facts.push({
                    label: 'Produced so far',
                    value: `${mp.displayShots.toLocaleString()} / ${mp.requiredShots.toLocaleString()} good shots`,
                    color: isDone ? colors.status.success.fg : undefined,
                  });
                  if (mp.surplusShots > 0) {
                    facts.push({
                      label: 'Surplus',
                      value: `+${mp.surplusShots.toLocaleString()} shots`,
                      color: colors.status.info.fg,
                    });
                  }
                }
                return (
                  <View
                    key={m.id}
                    style={{
                      borderWidth: isEditing ? 2 : 1,
                      borderColor: isEditing ? colors.primary : colors.border,
                      borderRadius: 10,
                      backgroundColor: isEditing ? colors.surfaceAlt : colors.surface,
                      padding: spacing(3),
                      marginBottom: spacing(2),
                    }}
                  >
                    {/* Header: mould name (wraps freely) + status pill */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2) }}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="caption" tone="muted">Mould</AppText>
                        <AppText variant="h3">{m.moldName}</AppText>
                      </View>
                      <View
                        style={{
                          backgroundColor: statusTone.bg,
                          borderRadius: 999,
                          paddingVertical: 3,
                          paddingHorizontal: spacing(2),
                        }}
                      >
                        <AppText variant="caption" weight="700" style={{ color: statusTone.fg }}>
                          {statusLabel}
                        </AppText>
                      </View>
                    </View>

                    {/* Facts: label on the left, value on the right; long values wrap under the label
                        instead of pushing anything off-screen. */}
                    <View style={{ marginTop: spacing(2), borderTopWidth: 1, borderTopColor: colors.border }}>
                      {facts.map((f) => (
                        <View
                          key={f.label}
                          style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            gap: spacing(1),
                            paddingVertical: spacing(1),
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                          }}
                        >
                          <AppText variant="caption" tone="muted" style={{ minWidth: 120 }}>
                            {f.label}
                          </AppText>
                          <AppText variant="caption" weight="600" style={[{ flexShrink: 1 }, f.color ? { color: f.color } : null]}>
                            {f.value}
                          </AppText>
                        </View>
                      ))}
                    </View>

                    {isEditing ? (
                      <AppText variant="caption" weight="700" style={{ color: colors.primary, marginTop: spacing(2) }}>
                        ✎ Editing this mould in the form below
                      </AppText>
                    ) : null}

                    {/* Actions: full-width row under the facts, so they are ALWAYS on screen no
                        matter how long the mould / part names are. */}
                    <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) }}>
                      <Button
                        label="✎ Edit"
                        variant="primary"
                        onPress={() => editMold(m)}
                        disabled={isEditing}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label="🗑 Delete"
                        variant="danger"
                        onPress={() => confirmDeleteMold(m)}
                        loading={deleteMold.isPending && deleteMold.variables === m.id}
                        disabled={deleteMold.isPending}
                        style={{ flex: 1, backgroundColor: '#DC2626' }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Company-wide mould dropdown — pick any mould already set up for this company (across
              all its item codes) instead of re-entering it. Fills the form; set Required Shots + save.
              Each row also carries a solid-red DELETE button that erases the mould company-wide. */}
          {companyMoldOptions.length > 0 && !editingMold ? (
            <View style={{ marginBottom: spacing(3) }}>
              <Select
                label="Reuse a mould from this company (tap a name to use it · DELETE removes it)"
                value={null}
                options={companyMoldOptions}
                onChange={(v) => {
                  const s = companySuggestions.find((x) => x.moldName === v);
                  if (s) adoptCompanySuggestion(s);
                }}
                onDeleteOption={(o) => {
                  const s = companySuggestions.find((x) => x.moldName === o.value);
                  if (s) confirmDeleteCompanyMold(s);
                }}
                deleteLabel="DELETE"
                placeholder="Select an existing mould"
                emptyHint="No moulds set up for this company yet"
              />
              {deleteCompanyMold.isPending ? (
                <AppText variant="caption" tone="muted">Deleting mould…</AppText>
              ) : null}
            </View>
          ) : null}

          {moldOk ? <Banner tone="success" message={moldOk} /> : null}
          {moldDupError ? <Banner tone="danger" message={moldDupError} /> : null}
          {moldError ? <Banner tone="danger" message={moldError} /> : null}
          {deleteMoldError ? <Banner tone="info" message={deleteMoldError} /> : null}
          {deleteCompanyMoldError ? <Banner tone="danger" message={deleteCompanyMoldError} /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
            <AppText variant="caption" tone="muted">
              {editingMold ? `Editing mould "${editingMold}" — change the fields and tap Update` : 'Add a new mould (or tap Edit on a mould above to change it)'}
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
              setMoldDupError(null);
              // A mould name is the key of a setup on this item code. Saving a NEW mould under a
              // name that is already set up would overwrite that setup instead of adding one —
              // refuse here (and the backend refuses too) so every mould entered is kept.
              const typed = mMoldName.trim().toLowerCase();
              const clash = moldList.find(
                (m) => m.moldName.toLowerCase() === typed && m.moldName !== editingMold
              );
              if (clash) {
                setMoldDupError(
                  `A mould named "${clash.moldName}" is already set up on this item code ` +
                    `(${clash.partName}, ${clash.cavity} cavity). Give this mould a different name ` +
                    `(e.g. "${mMoldName.trim()} – ${mCavity || 'N'} cav"), or tap Edit on that card to change it.`
                );
                return;
              }
              saveMold.mutate();
            }}
          />
        </Card>
      ) : null}

      {/* Production push */}
      {cp.jobId && !isProductionComplete ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Production Push
          </AppText>
          {ok ? <Banner tone="success" message={ok} /> : null}
          {moldAlreadyComplete ? (
            <Banner
              tone="success"
              message={`${selectedMold ?? 'This mould'} has already reached its target — it is complete and locked. Any extra shots you produced are counted as surplus below.`}
            />
          ) : null}
          {error ? <Banner tone="info" message={error} /> : null}

          <Select
            label="Shift"
            value={shift}
            options={SHIFT_OPTIONS}
            onChange={(v) => setShift(v as Shift)}
            placeholder="Select the shift"
          />
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

          {/* Progress against this item code's target for the selected mould. The target is a
              plan, not a cap — an entry is always accepted in full and anything beyond the
              target flows to Surplus, so this NEVER blocks or rejects. */}
          {remainingShots !== null ? (
            <Banner
              tone={moldLocked || completesMould ? 'success' : 'info'}
              persistent
              message={
                moldLocked
                  ? `${selectedMold} is complete for this item code — target of ${targetShots.toLocaleString()} good shots reached (${doneShots.toLocaleString()} done). This mould is locked.`
                  : completesMould
                    ? `This entry completes ${selectedMold}.${surplusShots > 0 ? ` ${surplusShots.toLocaleString()} good shot${surplusShots === 1 ? '' : 's'} beyond target → Surplus.` : ''} The mould locks after this entry.`
                    : `Progress for ${selectedMold}: ${doneShots.toLocaleString()} / ${targetShots.toLocaleString()} good shots (${remainingShots.toLocaleString()} to target).`
              }
            />
          ) : null}

          {/* When the mould is locked (target reached) we do NOT show a submittable form — the
              engineer sees a calm "Done + surplus" panel, never a red rejection. Every OTHER
              mould accepts any number of shots; the entry that crosses the target is taken in
              full and its overage becomes surplus automatically. */}
          {selectedMold && moldLocked ? (
            <View
              style={{
                backgroundColor: colors.status.success.bg,
                borderRadius: 8,
                padding: spacing(3),
              }}
            >
              <AppText weight="700" style={{ color: colors.status.success.fg }}>
                ✓ {selectedMold} is complete for this item code
              </AppText>
              <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                Target of {targetShots.toLocaleString()} shots reached. This mould is locked — no
                more entries needed. See its surplus in the Surplus section below.
              </AppText>
            </View>
          ) : (
            <>
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

              {/* Good shots preview — the Entry page is in SHOTS. Informational, never a red rejection.
                  (The pieces that reach the store = good shots × cavity are shown on the Store page.) */}
              {goodShotsThisEntry !== null && goodShotsThisEntry >= 0 ? (
                <Banner
                  tone="info"
                  persistent
                  message={`Good Shots = ${shotsNum} − ${rejectedShotsNum} = ${goodShotsThisEntry} shots`}
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
            </>
          )}
        </Card>
      ) : null}

      {/* Production complete banner (only when the item code is finished) */}
      {cp.jobId && isProductionComplete ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <Banner tone="success" persistent message="Production complete for this item code." />
        </Card>
      ) : null}

      {/* Surplus — auto-moved from over-production. The Entry page is in SHOTS, so surplus is
          shown here in SHOTS (the Store page shows the same surplus in PIECES). Always visible so
          the engineer can SEE where the extra good shots went: per mould for this item code, and
          cumulative for the same physical mould pooled across every item code in this PO. */}
      {cp.jobId ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing(1),
            }}
          >
            <AppText variant="h3">Surplus</AppText>
            <AppText weight="800" style={{ color: colors.status.info.fg }}>
              {itemSurplusTotalShots.toLocaleString()} shots
            </AppText>
          </View>
          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(3) }}>
            Good shots produced beyond a mould's target are moved to surplus automatically (shown as
            pieces in the Store).
          </AppText>

          {/* This item code — per mould */}
          <AppText variant="caption" weight="700" tone="muted" style={{ marginBottom: spacing(1) }}>
            THIS ITEM CODE{cp.itemCode ? ` · ${cp.itemCode}` : ''}
          </AppText>
          {itemSurplusMoulds.length === 0 ? (
            <AppText variant="caption" tone="muted">No surplus for this item code yet.</AppText>
          ) : (
            itemSurplusMoulds.map((m) => (
              <View
                key={m.moldName}
                style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}
              >
                <AppText variant="caption" weight="600">
                  {m.moldName}
                  {m.partName ? ` · ${m.partName}` : ''}
                </AppText>
                <AppText variant="caption" weight="700" style={{ color: colors.status.info.fg }}>
                  +{m.surplusShots.toLocaleString()} shots
                </AppText>
              </View>
            ))
          )}

          {/* Cumulative — same physical mould pooled across every item code in this PO */}
          {cumulativeSurplusMoulds.length > 0 ? (
            <View
              style={{
                marginTop: spacing(3),
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: spacing(2),
              }}
            >
              <AppText variant="caption" weight="700" tone="muted" style={{ marginBottom: spacing(1) }}>
                CUMULATIVE · SAME MOULD ACROSS THIS PO
              </AppText>
              {cumulativeSurplusMoulds.map((m) => {
                const parts = m.breakdown.filter((b) => b.surplusShots > 0);
                return (
                  <View key={m.moldName} style={{ paddingVertical: 3 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText variant="caption" weight="600">{m.moldName}</AppText>
                      <AppText variant="caption" weight="700" style={{ color: colors.status.success.fg }}>
                        +{m.totalSurplusShots.toLocaleString()} shots
                      </AppText>
                    </View>
                    {parts.length > 1 ? (
                      <AppText variant="caption" tone="muted">
                        {parts.map((b) => `${b.itemCode ?? 'Item'}: ${b.surplusShots.toLocaleString()}`).join('  ·  ')}
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Recover Good Pieces from Rejected Shots — available anytime during entry (req #9).
          Physically inspected rejected shots that turn out good are recovered into Product
          Surplus. No longer gated behind production completion. */}
      {cp.jobId ? (
        <Card style={{ marginBottom: spacing(4) }}>
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
              {recoverError ? <Banner tone="info" message={recoverError} /> : null}
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
              No molds set up for this item code.
            </AppText>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
