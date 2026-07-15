import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { mouldingApi } from '@/api/endpoints/moulding';
import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCSeverity } from '@/api/types';
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
import { PhotoPickerGrid, SeveritySelector, QC_TAGS } from '@/components/qc';
import { useCurrentUser } from '@/hooks/useAuth';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { buildRecordFormData, type PickedFile } from '@/services/mediaUpload';
import { useTheme } from '@/theme/ThemeProvider';
import { currentShift, shiftLabel } from '@/utils/shift';
import type { QCStackParamList } from './navTypes';

type Nav = NativeStackNavigationProp<QCStackParamList, 'CreateQCReport'>;

export function CreateQCReportScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<QCStackParamList, 'CreateQCReport'>>();
  const { department, orderId } = params;
  const user = useCurrentUser();
  const qc = useQueryClient();

  // Auto-fill context (company / product / machine + mould suggestions).
  const ctxQuery = useQuery({
    queryKey: queryKeys.qc.orderContext(orderId, department),
    queryFn: () => qcReportsApi.orderContext(orderId, department),
  });
  const defectQuery = useQuery({
    queryKey: queryKeys.qc.defectTypes,
    queryFn: () => qcReportsApi.defectTypes(),
  });
  // Machines (all existing) → dropdown, so the engineer selects instead of typing.
  const machineQuery = useQuery({
    queryKey: queryKeys.machines({}),
    queryFn: () => masterApi.listMachines(),
  });
  // Moulds the engineer set up for THIS order → dropdown; selecting one auto-fills its part.
  const orderMoldsQuery = useQuery({
    queryKey: queryKeys.orderMolds(orderId),
    queryFn: () => mouldingApi.orderMolds(orderId),
  });
  // Defects entered at production time (rejection reasons) are reused here (req: copy them).
  const reasonsQuery = useQuery({
    queryKey: queryKeys.rejectionReasons,
    queryFn: () => mouldingApi.rejectionReasons(),
  });

  // Form state.
  const [machine, setMachine] = useState('');
  const [mould, setMould] = useState('');
  const [part, setPart] = useState('');
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [defects, setDefects] = useState<string[]>([]);
  const [newDefect, setNewDefect] = useState('');
  const [severity, setSeverity] = useState<QCSeverity>('minor');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [ok, setOk] = useState<string | null>(null);

  const ctx = ctxQuery.data;
  const shift = currentShift();

  // Required chain ids: from the route (fall back to order-context if opened directly), so
  // the Submit button never waits on the async context query.
  const customerId = params.customerId ?? ctx?.order.customerId ?? null;
  const productId = params.productId ?? ctx?.order.productId ?? null;

  const molds = orderMoldsQuery.data?.molds ?? [];
  const machineOptions: SelectOption[] = (machineQuery.data ?? []).map((m) => ({
    label: m.name,
    value: m.name,
    hint: m.category === 'injection' ? 'Injection' : 'Blow',
  }));
  const moldOptions: SelectOption[] = molds.map((m) => ({
    label: m.moldName,
    value: m.moldName,
    hint: `${m.partName} · ${m.cavity} cav`,
  }));

  // Defect options = production-time rejection reasons + the QC defect vocabulary, merged
  // and de-duplicated. Adding a new defect persists it app-wide (remembered everywhere).
  const defectOptions = useMemo(() => {
    const set = new Set<string>([...(reasonsQuery.data ?? []), ...(defectQuery.data ?? [])]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [reasonsQuery.data, defectQuery.data]);

  // Selecting a mould auto-fills its part (still editable — fix a wrong pick anytime).
  const selectMould = (v: string) => {
    setMould(v);
    const m = molds.find((x) => x.moldName === v);
    if (m) setPart(m.partName);
  };

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const addNewDefect = () => {
    const d = newDefect.trim();
    if (!d) return;
    if (!defects.includes(d)) setDefects((p) => [...p, d]);
    if (!(defectQuery.data ?? []).includes(d)) {
      // Optimistic + persist app-wide so it's permanently available everywhere.
      qc.setQueryData(queryKeys.qc.defectTypes, (old: string[] | undefined) =>
        old ? [...old, d].sort() : [d]
      );
      qcReportsApi
        .addDefectType(d)
        .then((list) => qc.setQueryData(queryKeys.qc.defectTypes, list))
        .catch(() => {});
    }
    setNewDefect('');
  };

  const submit = useMutation({
    mutationFn: () => {
      const form = buildRecordFormData({
        fields: {
          department,
          customerId: customerId!,
          productId: productId!,
          orderId,
          machine,
          mould,
          part,
          shift,
          severity,
          description,
          defects,
          tags,
        },
        files: [{ field: 'photos', kind: 'image', items: photos }],
      });
      return qcReportsApi.create(form);
    },
    onSuccess: () => {
      setOk('QC report submitted.');
      qc.invalidateQueries({ queryKey: queryKeys.qc.orderContext(orderId, department) });
      // Broad prefix so every report list for this department (incl. the QC tab's inline
      // list) and the active-orders list refresh.
      qc.invalidateQueries({ queryKey: ['qc', 'reports'] });
      qc.invalidateQueries({ queryKey: queryKeys.qc.activeOrders(department) });
      qc.invalidateQueries({ queryKey: queryKeys.qc.summary(orderId, department) });
      navigation.goBack();
    },
  });

  const error = submit.error instanceof ApiError ? friendlyMessage(submit.error) : null;

  // Only the fields the backend actually requires. Everything here is auto-linked (ids) or
  // just needs one piece of defect evidence — so we can list exactly what's missing instead
  // of silently disabling the button.
  const hasContent = defects.length > 0 || photos.length > 0 || description.trim().length > 0;
  const missing: string[] = [];
  if (!customerId || !productId || !orderId) missing.push('order details (reopen from the QC screen)');
  if (!hasContent) missing.push('at least one photo, defect, or description');
  const canSubmit = missing.length === 0 && !submit.isPending;

  return (
    <Screen scroll contentStyle={{ paddingBottom: 160 }}>
      <AppText variant="h1" style={{ marginBottom: spacing(1) }}>
        New QC Report
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        {department === 'assembly' ? 'Assembly QC' : 'Moulding QC'}
      </AppText>

      {/* Auto-filled context */}
      <Card style={{ marginBottom: spacing(4) }}>
        <Row label="Company" value={ctx?.order.customerName ?? '…'} />
        <Row label="Product" value={ctx?.order.productName ?? '…'} />
        <Row label="Order ID" value={ctx?.order.orderCode ?? '…'} />
        <Row label="Engineer" value={user?.name ?? '—'} />
        <Row label="Shift" value={shiftLabel(shift)} />
        <Row label="Date" value={new Date().toLocaleDateString('en-IN')} last />
      </Card>

      {/* Where — machine + mould from dropdowns (select, don't type) */}
      <Card style={{ marginBottom: spacing(4) }}>
        <AppText variant="h3" style={{ marginBottom: spacing(3) }}>
          Where
        </AppText>
        <Select
          label="Machine"
          value={machine || null}
          options={machineOptions}
          onChange={(v) => setMachine(v)}
          placeholder="Select a machine"
          emptyHint="Ask admin to add machines"
        />
        <Select
          label="Mould"
          value={mould || null}
          options={moldOptions}
          onChange={selectMould}
          placeholder="Select a mould"
          emptyHint="No moulds set up for this order yet"
        />
        {/* Part auto-fills from the selected mould but stays editable. */}
        <FormField label="Part" value={part} onChangeText={setPart} placeholder="Auto-filled from mould" />
      </Card>

      {/* Photos */}
      <Card style={{ marginBottom: spacing(4) }}>
        <AppText variant="h3" style={{ marginBottom: spacing(3) }}>
          Photos
        </AppText>
        <PhotoPickerGrid photos={photos} onChange={setPhotos} />
        {submit.isPending && photos.length > 0 ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
            Uploading {photos.length} photo{photos.length === 1 ? '' : 's'}…
          </AppText>
        ) : null}
      </Card>

      {/* Defects */}
      <Card style={{ marginBottom: spacing(4) }}>
        <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
          Defects
        </AppText>
        <MultiCheckbox
          label="Select all that apply"
          options={defectOptions}
          selected={defects}
          onToggle={(v) => setDefects((p) => toggle(p, v))}
          newEntryValue={newDefect}
          onNewEntryChange={setNewDefect}
          onAddNewEntry={addNewDefect}
          newEntryPlaceholder="Add new defect…"
        />
        <SeveritySelector value={severity} onChange={setSeverity} />
      </Card>

      {/* Description + tags */}
      <Card style={{ marginBottom: spacing(4) }}>
        <FormField
          label="Description (problem · location · cause · recommendation)"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the defect…"
          multiline
        />
        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
          Tags (optional)
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
          {QC_TAGS.map((t) => {
            const active = tags.includes(t);
            return (
              <Pressable
                key={t}
                onPress={() => setTags((p) => toggle(p, t))}
                style={{
                  backgroundColor: active ? colors.status.info.bg : colors.surfaceAlt,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing(3),
                  paddingVertical: spacing(2),
                  borderWidth: 1.5,
                  borderColor: active ? colors.status.info.fg : 'transparent',
                }}
              >
                <AppText variant="caption" weight="600" style={{ color: active ? colors.status.info.fg : colors.text }}>
                  {t}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {ok ? <Banner tone="success" message={ok} /> : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      {missing.length > 0 ? (
        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2), textAlign: 'center' }}>
          To submit, add: {missing.join(' · ')}.
        </AppText>
      ) : null}

      <Button
        label="Submit QC Report"
        loading={submit.isPending}
        disabled={!canSubmit}
        onPress={() => {
          setOk(null);
          submit.mutate();
        }}
      />
    </Screen>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing(2),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <AppText tone="muted">{label}</AppText>
      <AppText weight="600">{value}</AppText>
    </View>
  );
}
