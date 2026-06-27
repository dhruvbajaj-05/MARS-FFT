import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';

import type { MouldingRecord, Paginated } from '@/api/types';
import { mouldingApi } from '@/api/endpoints/moulding';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Banner, Button, Card, FormField, MultiCheckbox, QueryBoundary, Screen, Select } from '@/components';
import { departmentForRole } from '@/features/engineer/department';
import { useCurrentUser } from '@/hooks/useAuth';
import { useTheme } from '@/theme/ThemeProvider';
import { useCustomerProduct } from './useCustomerProduct';
import { ApiError, friendlyMessage } from '@/services/apiError';

// ---- Aggregation helpers for moulding grouped view (req #6) ----

type CavityGroup = {
  cavity: number;
  partName: string;
  moldName: string;
  totalShots: number;
  totalRejectedShots: number;
  goodPieces: number;
  records: MouldingRecord[];
};
type MachineGroup = {
  machine: string;
  cavities: CavityGroup[];
};
type ShiftGroup = {
  shift: string;
  machines: MachineGroup[];
};

function groupMouldingRecords(records: MouldingRecord[]): ShiftGroup[] {
  const shifts: Record<string, Record<string, Record<string, CavityGroup>>> = {};

  for (const r of records) {
    const s = r.shift ?? '?';
    const m = r.machineNumber ?? '?';
    const key = `${r.partName}|${r.cavity}`;

    if (!shifts[s]) shifts[s] = {};
    if (!shifts[s][m]) shifts[s][m] = {};
    if (!shifts[s][m][key]) {
      shifts[s][m][key] = {
        cavity: r.cavity,
        partName: r.partName,
        moldName: r.moldName,
        totalShots: 0,
        totalRejectedShots: 0,
        goodPieces: 0,
        records: [],
      };
    }
    const g = shifts[s][m][key];
    g.totalShots += r.shotsDone;
    g.totalRejectedShots += r.rejectedShots ?? 0;
    g.goodPieces += r.goodParts;
    g.records.push(r);
  }

  return Object.entries(shifts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([shift, machines]) => ({
      shift,
      machines: Object.entries(machines)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([machine, cavities]) => ({
          machine,
          cavities: Object.values(cavities).sort((a, b) => a.partName.localeCompare(b.partName)),
        })),
    }));
}

// ---- Edit modal (inline) for a single moulding record ----
function MouldingEditPanel({
  record,
  reasons,
  onClose,
  onSaved,
}: {
  record: MouldingRecord;
  reasons: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { spacing, colors } = useTheme();
  const [shots, setShots] = useState(String(record.shotsDone));
  const [rejShots, setRejShots] = useState(String(record.rejectedShots ?? 0));
  const [selReasons, setSelReasons] = useState<string[]>(
    record.rejectionReasons.length > 0
      ? record.rejectionReasons
      : record.rejectionReason
        ? [record.rejectionReason]
        : []
  );
  const [newReason, setNewReason] = useState('');
  const [comments, setComments] = useState(record.comments ?? '');
  const [allReasons, setAllReasons] = useState<string[]>(reasons);

  const mutation = useMutation({
    mutationFn: () =>
      mouldingApi.update(record.id, {
        shotsDone: Number(shots),
        rejectedShots: Number(rejShots),
        rejectionReasons: selReasons,
        comments,
      }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const editError = mutation.error instanceof ApiError ? friendlyMessage(mutation.error) : null;

  const addNewReason = () => {
    const r = newReason.trim();
    if (!r) return;
    if (!selReasons.includes(r)) setSelReasons((prev) => [...prev, r]);
    if (!allReasons.includes(r)) setAllReasons((prev) => [...prev, r].sort());
    setNewReason('');
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: spacing(4),
        marginTop: spacing(2),
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
        Edit Record
      </AppText>
      {editError ? <Banner tone="danger" message={editError} /> : null}
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
        Part: {record.partName} · Cavity: {record.cavity}
      </AppText>
      <FormField label="Total Shots Produced" value={shots} onChangeText={setShots} keyboardType="number-pad" />
      <FormField label="Rejected Shots" value={rejShots} onChangeText={setRejShots} keyboardType="number-pad" />
      <MultiCheckbox
        label="Defects"
        options={allReasons}
        selected={selReasons}
        onToggle={(r) =>
          setSelReasons((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])
        }
        newEntryValue={newReason}
        onNewEntryChange={setNewReason}
        onAddNewEntry={addNewReason}
      />
      <FormField label="Comments" value={comments} onChangeText={setComments} multiline />
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        <Button label="Save" loading={mutation.isPending} onPress={() => mutation.mutate()} />
        <Button label="Cancel" onPress={onClose} />
      </View>
    </View>
  );
}

// ---- Moulding-specific grouped records (req #6 + #7) ----
function MouldingRecords() {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();
  const cp = useCustomerProduct();
  const { customerId, productId, orderId } = cp;

  const [expandedShift, setExpandedShift] = useState<string | null>(null);
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const params = {
    page: 1,
    limit: 200,
    customerId: customerId ?? undefined,
    productId: productId ?? undefined,
    orderId: orderId ?? undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.dept('moulding').mine(params),
    queryFn: () => mouldingApi.listMine(params),
    enabled: !!customerId && !!productId,
  });

  const reasons = useQuery({
    queryKey: queryKeys.rejectionReasons,
    queryFn: () => mouldingApi.rejectionReasons(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mouldingApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').mine({}) });
      qc.invalidateQueries({ queryKey: ['moulding'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? friendlyMessage(err) : 'Delete failed';
      Alert.alert('Error', msg);
    },
  });

  const confirmDelete = (record: MouldingRecord) => {
    if (!record.canEdit) return;
    Alert.alert('Delete Record', `Delete this production entry (${record.shotsDone} shots · ${record.goodParts} good)?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(record.id) },
    ]);
  };

  const orderCodeFor = (id?: string) =>
    cp.orderList.find((o) => o.id === id)?.orderCode ?? 'Order';

  const ready = !!customerId && !!productId;
  const allReasons = reasons.data ?? [];

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Moulding Records
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
        />
        {ready ? (
          <Select
            label="OrderID (optional)"
            value={orderId}
            options={[{ label: 'All orders', value: '' }, ...cp.orderOptions]}
            onChange={(v) => cp.setOrderId(v === '' ? null : v)}
            placeholder="All orders"
          />
        ) : null}
      </Card>

      {!ready ? (
        <AppText tone="muted">Select a customer and product to view records.</AppText>
      ) : (
        <QueryBoundary
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          data={query.data}
          onRetry={query.refetch}
        >
          {(d) => {
            if (d.data.length === 0) {
              return <AppText tone="muted">No moulding records for this selection.</AppText>;
            }
            const groups = groupMouldingRecords(d.data);
            return (
              <View style={{ gap: spacing(3) }}>
                {groups.map((sg) => {
                  const shiftKey = sg.shift;
                  const isShiftOpen = expandedShift === shiftKey;
                  return (
                    <Card key={shiftKey}>
                      {/* Shift header */}
                      <Pressable
                        onPress={() => setExpandedShift(isShiftOpen ? null : shiftKey)}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <AppText variant="h3">Shift {sg.shift}</AppText>
                        <AppText tone="muted">{isShiftOpen ? '▾' : '▸'}</AppText>
                      </Pressable>

                      {isShiftOpen && sg.machines.map((mg) => {
                        const machineKey = `${shiftKey}|${mg.machine}`;
                        const isMachineOpen = expandedMachine === machineKey;
                        return (
                          <View
                            key={mg.machine}
                            style={{
                              marginTop: spacing(2),
                              borderLeftWidth: 2,
                              borderLeftColor: colors.border,
                              paddingLeft: spacing(3),
                            }}
                          >
                            {/* Machine header */}
                            <Pressable
                              onPress={() => setExpandedMachine(isMachineOpen ? null : machineKey)}
                              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}
                            >
                              <AppText weight="600">Machine {mg.machine}</AppText>
                              <AppText tone="muted" variant="caption">{isMachineOpen ? '▾' : '▸'}</AppText>
                            </Pressable>

                            {/* Cavity groups */}
                            {mg.cavities.map((cg) => (
                              <View
                                key={`${cg.partName}|${cg.cavity}`}
                                style={{
                                  backgroundColor: colors.surfaceAlt,
                                  borderRadius: 8,
                                  padding: spacing(3),
                                  marginBottom: spacing(2),
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
                                  <AppText weight="600">
                                    {cg.cavity} Cavity — {cg.partName}
                                  </AppText>
                                  <AppText variant="caption" tone="muted">{cg.records.length} entr{cg.records.length === 1 ? 'y' : 'ies'}</AppText>
                                </View>
                                <AppText variant="caption" tone="muted">
                                  {cg.totalShots.toLocaleString()} Shots · {cg.totalRejectedShots.toLocaleString()} Rejected Shots
                                </AppText>
                                <AppText variant="caption" weight="600" style={{ color: colors.status.success.fg }}>
                                  {cg.goodPieces.toLocaleString()} Good Pieces
                                </AppText>

                                {/* Individual records (edit/delete) */}
                                {isMachineOpen && cg.records.map((r) => {
                                  const isEditing = editingRecordId === r.id;
                                  return (
                                    <View
                                      key={r.id}
                                      style={{
                                        marginTop: spacing(2),
                                        padding: spacing(2),
                                        backgroundColor: colors.surface,
                                        borderRadius: 8,
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                      }}
                                    >
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <View style={{ flex: 1 }}>
                                          <AppText variant="caption">
                                            {r.shotsDone} shots · {r.rejectedShots ?? '—'} rej shots · {r.goodParts} good
                                          </AppText>
                                          {r.rejectionReasons.length > 0 ? (
                                            <AppText variant="caption" tone="muted">
                                              {r.rejectionReasons.join(', ')}
                                            </AppText>
                                          ) : null}
                                          <AppText variant="caption" tone="muted">
                                            {new Date(r.createdAt).toLocaleString()} · {orderCodeFor(r.orderId)}
                                          </AppText>
                                          {!r.canEdit ? (
                                            <AppText variant="caption" style={{ color: colors.status.pending.fg }}>
                                              Edit window closed (12h passed)
                                            </AppText>
                                          ) : null}
                                        </View>
                                        {r.canEdit ? (
                                          <View style={{ flexDirection: 'row', gap: spacing(1) }}>
                                            <Pressable
                                              onPress={() => setEditingRecordId(isEditing ? null : r.id)}
                                              style={{
                                                backgroundColor: colors.status.info.bg,
                                                borderRadius: 6,
                                                paddingHorizontal: spacing(2),
                                                paddingVertical: spacing(1),
                                              }}
                                            >
                                              <AppText variant="caption" style={{ color: colors.status.info.fg }}>
                                                {isEditing ? 'Cancel' : 'Edit'}
                                              </AppText>
                                            </Pressable>
                                            <Pressable
                                              onPress={() => confirmDelete(r)}
                                              style={{
                                                backgroundColor: colors.status.danger.bg,
                                                borderRadius: 6,
                                                paddingHorizontal: spacing(2),
                                                paddingVertical: spacing(1),
                                              }}
                                            >
                                              <AppText variant="caption" style={{ color: colors.status.danger.fg }}>
                                                Delete
                                              </AppText>
                                            </Pressable>
                                          </View>
                                        ) : null}
                                      </View>
                                      {isEditing ? (
                                        <MouldingEditPanel
                                          record={r}
                                          reasons={allReasons}
                                          onClose={() => setEditingRecordId(null)}
                                          onSaved={() => {
                                            setEditingRecordId(null);
                                            qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').mine({}) });
                                          }}
                                        />
                                      ) : null}
                                    </View>
                                  );
                                })}
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </Card>
                  );
                })}
              </View>
            );
          }}
        </QueryBoundary>
      )}
    </Screen>
  );
}

// ---- Other departments: flat list ----
type AnyRecord = {
  id: string;
  createdAt: string;
  orderId?: string;
  assembledSets?: number;
  extraSets?: number;
  fromSurplus?: boolean;
  assembledQuantity?: number;
  acceptedQuantity?: number;
  packedQuantity?: number;
};

function FlatRecords({ dept }: { dept: ReturnType<typeof departmentForRole> }) {
  const { spacing } = useTheme();
  const params = { page: 1, limit: 50 };
  const query = useQuery({
    queryKey: queryKeys.dept(dept?.key ?? 'none').mine(params),
    queryFn: () => dept!.api.listMine(params) as Promise<Paginated<AnyRecord>>,
    enabled: !!dept,
  });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        My {dept?.recordNoun ?? 'Record'}s
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
