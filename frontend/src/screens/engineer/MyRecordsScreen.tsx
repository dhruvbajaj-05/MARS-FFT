import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import type { Paginated } from '@/api/types';
import { mouldingApi } from '@/api/endpoints/moulding';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Banner, Button, Card, FormField, QueryBoundary, Screen, Select } from '@/components';
import { MouldingRecordsList } from '@/features/moulding/MouldingRecordsList';
import { departmentForRole } from '@/features/engineer/department';
import { useCurrentUser } from '@/hooks/useAuth';
import { useTheme } from '@/theme/ThemeProvider';
import { usePOItemCode } from './usePOItemCode';
import { ApiError, friendlyMessage } from '@/services/apiError';

// ---- Moulding-specific grouped records (Shift → Cavity → entries) ----
// The grouped rendering + inline edit/delete live in the shared MouldingRecordsList so the
// admin records page can present an IDENTICAL view (read-only) via a department selector.
function MouldingRecords() {
  const { spacing } = useTheme();
  const cp = usePOItemCode();
  const { customerId, productId, jobId } = cp;

  const params = {
    page: 1,
    limit: 200,
    customerId: customerId ?? undefined,
    productId: productId ?? undefined,
    orderId: jobId ?? undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.dept('moulding').mine(params),
    queryFn: () => mouldingApi.listMine(params),
    enabled: !!jobId,
  });

  const reasons = useQuery({
    queryKey: queryKeys.rejectionReasons,
    queryFn: () => mouldingApi.rejectionReasons(),
  });

  const itemCodeFor = (id?: string | null) =>
    cp.jobList.find((o) => o.id === id)?.itemCode ?? cp.itemCode ?? 'Item';

  const ready = !!jobId;
  const allReasons = reasons.data ?? [];

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        Moulding Records
      </AppText>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(3) }}>
        Team-wide — every moulding engineer&apos;s production. You can edit/delete only your own
        entries (within 12h).
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
          label="Purchase Order"
          value={cp.purchaseOrderId}
          options={cp.purchaseOrderOptions}
          onChange={(v) => cp.selectPurchaseOrder(v)}
          placeholder={customerId ? 'Select a purchase order…' : 'Select a customer first'}
          emptyHint="No purchase orders for this customer"
        />
        <Select
          label="Item Code"
          value={jobId}
          options={cp.jobOptions}
          onChange={(v) => cp.setJobId(v)}
          placeholder={cp.purchaseOrderId ? 'Select an item code…' : 'Select a purchase order first'}
          emptyHint="No item codes in this PO"
        />
      </Card>

      {!ready ? (
        <AppText tone="muted">Select a customer, purchase order and item code to view records.</AppText>
      ) : (
        <QueryBoundary
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          data={query.data}
          onRetry={query.refetch}
        >
          {(d) => (
            <MouldingRecordsList
              records={d.data}
              itemCodeFor={itemCodeFor}
              editable
              reasons={allReasons}
            />
          )}
        </QueryBoundary>
      )}
    </Screen>
  );
}

// ---- Other departments: flat list with edit/delete (within the 12h window) ----
type AnyRecord = {
  id: string;
  createdAt: string;
  canEdit?: boolean;
  orderId?: string;
  assembledSets?: number;
  extraSets?: number;
  fromSurplus?: boolean;
  assembledQuantity?: number;
  acceptedQuantity?: number;
  packedQuantity?: number;
  [key: string]: unknown;
};

type FieldSpec = { name: string; label: string; numeric?: boolean; multiline?: boolean };

// Editable fields per department (mirrors what each backend edit accepts).
const EDIT_FIELDS: Record<string, FieldSpec[]> = {
  assembly: [
    { name: 'assembledSets', label: 'Assembled Sets (total)', numeric: true },
    { name: 'assemblyLine', label: 'Assembly Line' },
    { name: 'operatorCount', label: 'Operators', numeric: true },
    { name: 'rejectedQuantity', label: 'Rejected', numeric: true },
    { name: 'remarks', label: 'Remarks', multiline: true },
  ],
  qc: [
    { name: 'inspectionType', label: 'Inspection Type' },
    { name: 'sampleSize', label: 'Sample Size', numeric: true },
    { name: 'acceptedQuantity', label: 'Accepted', numeric: true },
    { name: 'rejectedQuantity', label: 'Rejected', numeric: true },
    { name: 'defectCount', label: 'Defect Count', numeric: true },
    { name: 'remarks', label: 'Remarks', multiline: true },
  ],
  dispatch: [
    { name: 'packedQuantity', label: 'Packed Quantity', numeric: true },
    { name: 'cartonCount', label: 'Cartons', numeric: true },
    { name: 'transporterName', label: 'Transporter' },
    { name: 'vehicleNumber', label: 'Vehicle No.' },
    { name: 'lrNumber', label: 'LR No.' },
    { name: 'invoiceNumber', label: 'Invoice No.' },
    { name: 'dispatchRemarks', label: 'Remarks', multiline: true },
  ],
};

// The assembly "assembled sets" total is stored split as normal + extra on the record.
function initialFieldValue(deptKey: string, spec: FieldSpec, r: AnyRecord): string {
  if (deptKey === 'assembly' && spec.name === 'assembledSets') {
    return String((r.assembledSets ?? 0) + (r.extraSets ?? 0));
  }
  const v = r[spec.name];
  return v === undefined || v === null ? '' : String(v);
}

function FlatRecordEditPanel({
  dept,
  record,
  onClose,
  onSaved,
}: {
  dept: NonNullable<ReturnType<typeof departmentForRole>>;
  record: AnyRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { spacing } = useTheme();
  const specs = EDIT_FIELDS[dept.key] ?? [];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(specs.map((s) => [s.name, initialFieldValue(dept.key, s, record)])),
  );

  const save = useMutation({
    mutationFn: () => {
      const input: Record<string, unknown> = {};
      for (const s of specs) input[s.name] = s.numeric ? Number(values[s.name]) : values[s.name];
      return dept.api.update(record.id, input);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const error = save.error instanceof ApiError ? friendlyMessage(save.error) : null;

  return (
    <View style={{ marginTop: spacing(2) }}>
      {error ? <Banner tone="danger" message={error} /> : null}
      {specs.map((s) => (
        <FormField
          key={s.name}
          label={s.label}
          value={values[s.name] ?? ''}
          onChangeText={(v) => setValues((prev) => ({ ...prev, [s.name]: v }))}
          keyboardType={s.numeric ? 'number-pad' : 'default'}
          multiline={s.multiline}
        />
      ))}
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        <Button label="Save" loading={save.isPending} onPress={() => save.mutate()} style={{ flex: 1 }} />
        <Button label="Cancel" variant="secondary" disabled={save.isPending} onPress={onClose} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function FlatRecords({ dept }: { dept: ReturnType<typeof departmentForRole> }) {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const params = { page: 1, limit: 50 };
  const query = useQuery({
    queryKey: queryKeys.dept(dept?.key ?? 'none').mine(params),
    queryFn: () => dept!.api.listMine(params) as Promise<Paginated<AnyRecord>>,
    enabled: !!dept,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.dept(dept?.key ?? 'none').mine({}) });
    if (dept?.key) qc.invalidateQueries({ queryKey: [dept.key] });
    // Edits/deletes re-derive Finished Goods / component stores — refresh the store view.
    qc.invalidateQueries({ queryKey: ['store'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dept!.api.remove(id),
    onSuccess: invalidate,
    onError: (err) => {
      Alert.alert('Error', err instanceof ApiError ? friendlyMessage(err) : 'Delete failed');
    },
  });

  const confirmDelete = (r: AnyRecord) =>
    Alert.alert('Delete Record', `Delete this ${dept?.recordNoun?.toLowerCase() ?? 'record'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(r.id) },
    ]);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        {dept?.recordNoun ?? 'Record'}s
      </AppText>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(3) }}>
        Team-wide — all {dept?.recordNoun?.toLowerCase() ?? 'record'}s from your department. You can
        edit/delete only your own entries (within 12h).
      </AppText>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
      >
        {(d) =>
          d.data.length === 0 ? (
            <AppText tone="muted">No records yet.</AppText>
          ) : (
            <View style={{ gap: spacing(2) }}>
              {d.data.map((r) => (
                <Card key={r.id}>
                  <AppText weight="600">{summarize(r)}</AppText>
                  <AppText variant="caption" tone="muted">
                    {new Date(r.createdAt).toLocaleString()}
                  </AppText>

                  {r.canEdit && editingId !== r.id ? (
                    <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) }}>
                      <Button label="Edit" variant="secondary" onPress={() => setEditingId(r.id)} />
                      <Button
                        label="Delete"
                        variant="danger"
                        loading={deleteMutation.isPending}
                        onPress={() => confirmDelete(r)}
                      />
                    </View>
                  ) : null}

                  {dept && editingId === r.id ? (
                    <FlatRecordEditPanel
                      dept={dept}
                      record={r}
                      onClose={() => setEditingId(null)}
                      onSaved={invalidate}
                    />
                  ) : null}
                </Card>
              ))}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}

function summarize(r: AnyRecord): string {
  if (r.fromSurplus) return `Extra ${r.extraSets ?? 0} sets (from surplus)`;
  if (r.assembledSets !== undefined) return `Assembled ${r.assembledSets} sets`;
  if (r.assembledQuantity !== undefined) return `Assembled ${r.assembledQuantity}`;
  if (r.acceptedQuantity !== undefined) return `Approved ${r.acceptedQuantity}`;
  if (r.packedQuantity !== undefined) return `Dispatched ${r.packedQuantity}`;
  return r.id;
}

// ---- Entry point ----
export function MyRecordsScreen() {
  const user = useCurrentUser();
  const dept = user ? departmentForRole(user.role) : null;

  if (dept?.key === 'moulding') {
    return <MouldingRecords />;
  }

  return <FlatRecords dept={dept ?? null} />;
}
