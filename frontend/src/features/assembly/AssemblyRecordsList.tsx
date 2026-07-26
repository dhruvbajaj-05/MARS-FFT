import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { assemblyApi } from '@/api/endpoints/assembly';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Banner, Button, Card, FormField } from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useTheme } from '@/theme/ThemeProvider';

// An assembly record as far as this list is concerned. The engineer's AssemblyRecord and the
// admin's read-only view both satisfy it, so the SAME grouped UI renders for both — the only
// difference is `editable` (engineers edit/delete their own within 12h; admin is read-only).
export interface AssemblyListRecord {
  id: string;
  orderId: string | null;
  assemblyLine: string;
  operatorCount: number;
  shift: 'A' | 'B' | 'C';
  assembledSets: number;
  extraSets?: number;
  rejectedQuantity: number;
  // Optional so the admin read-only record shape (which omits these) can render the SAME list.
  consumption?: { partName: string; perSet: number; quantity: number; kind?: 'moulded' | 'outsourced' }[];
  remarks?: string | null;
  createdAt: string;
  canEdit?: boolean;
}

type ItemGroup = {
  key: string;
  heading: string;
  totalSets: number;
  totalRejected: number;
  records: AssemblyListRecord[];
};
type ShiftGroup = { shift: string; items: ItemGroup[] };

// Total produced sets on a record = order sets + any over-assembly extra sets.
const producedSets = (r: AssemblyListRecord) => (r.assembledSets ?? 0) + (r.extraSets ?? 0);

// Group Shift → Item Code (+ part name) → entries. Mirrors the moulding Shift → Cavity
// grouping, but an assembly entry builds a whole SET (many parts) rather than one moulded
// part, so the group heads on the item code being assembled; the assembly line moves to a
// per-entry detail below.
function groupAssemblyRecords(
  records: AssemblyListRecord[],
  headingFor: (orderId?: string | null) => string
): ShiftGroup[] {
  const shifts: Record<string, Record<string, ItemGroup>> = {};
  for (const r of records) {
    const s = r.shift ?? '?';
    const key = r.orderId ?? 'none';
    if (!shifts[s]) shifts[s] = {};
    if (!shifts[s][key]) {
      shifts[s][key] = { key, heading: headingFor(r.orderId), totalSets: 0, totalRejected: 0, records: [] };
    }
    const g = shifts[s][key];
    g.totalSets += producedSets(r);
    g.totalRejected += r.rejectedQuantity ?? 0;
    g.records.push(r);
  }
  return Object.entries(shifts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([shift, items]) => ({ shift, items: Object.values(items).sort((a, b) => a.heading.localeCompare(b.heading)) }));
}

// Returns "Xh Ym" remaining in the 12h edit window, or null if expired.
function editTimeRemaining(createdAt: string): string | null {
  const WINDOW = 12 * 60 * 60 * 1000;
  const remaining = WINDOW - (Date.now() - new Date(createdAt).getTime());
  if (remaining <= 0) return null;
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const SHIFT_LABEL = (s: string) =>
  s === 'A' ? 'A  (08:00–16:00)' : s === 'B' ? 'B  (16:00–00:00)' : s === 'C' ? 'C  (00:00–08:00)' : s;

// ---- Inline edit panel for a single assembly record (engineers only) ----
function AssemblyEditPanel({
  record,
  onClose,
  onSaved,
}: {
  record: AssemblyListRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { spacing, colors } = useTheme();
  const [sets, setSets] = useState(String(producedSets(record)));
  const [line, setLine] = useState(record.assemblyLine === '—' ? '' : record.assemblyLine);
  const [operators, setOperators] = useState(String(record.operatorCount ?? 0));
  const [rejected, setRejected] = useState(String(record.rejectedQuantity ?? 0));
  const [remarks, setRemarks] = useState(record.remarks ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      assemblyApi.update(record.id, {
        assembledSets: Number(sets),
        assemblyLine: line.trim() || undefined,
        operatorCount: Number(operators),
        rejectedQuantity: Number(rejected),
        remarks: remarks.trim() || undefined,
      }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  const editError = mutation.error instanceof ApiError ? friendlyMessage(mutation.error) : null;

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
      <AppText variant="h3" style={{ marginBottom: spacing(2) }}>Edit Record</AppText>
      {editError ? <Banner tone="danger" message={editError} /> : null}
      <FormField label="Produced sets (total)" value={sets} onChangeText={setSets} keyboardType="number-pad" />
      <FormField label="Assembly line" value={line} onChangeText={setLine} placeholder="e.g. Line 2" />
      <FormField label="Number of workers" value={operators} onChangeText={setOperators} keyboardType="number-pad" />
      <FormField label="Rejected sets" value={rejected} onChangeText={setRejected} keyboardType="number-pad" />
      <FormField label="Remarks" value={remarks} onChangeText={setRemarks} multiline />
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        <Button label="Save" loading={mutation.isPending} onPress={() => mutation.mutate()} />
        <Button label="Cancel" onPress={onClose} />
      </View>
    </View>
  );
}

// Shared assembly records renderer — Shift → Assembly Line → individual entries. Mirrors the
// Moulding records UI so the engineer's "My Records" page and the admin records page look
// identical; `editable` toggles per-entry Edit/Delete (engineers edit their own within 12h).
export function AssemblyRecordsList({
  records,
  itemCodeFor,
  partNameFor,
  editable = false,
  onChanged,
}: {
  records: AssemblyListRecord[];
  itemCodeFor: (orderId?: string | null) => string;
  // Resolves an entry's product/part name so the group heads on "Item Code — Part Name"
  // (like moulding). Optional: without it the heading is just the item code.
  partNameFor?: (orderId?: string | null) => string | null;
  editable?: boolean;
  onChanged?: () => void;
}) {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();

  // "TC-100 — Toy Car Set" style heading for each item-code group.
  const headingFor = (orderId?: string | null) => {
    const itemCode = itemCodeFor(orderId);
    const partName = partNameFor?.(orderId);
    return partName ? `${itemCode} — ${partName}` : itemCode;
  };

  const [expandedShift, setExpandedShift] = useState<string | null>(null);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.dept('assembly').mine({}) });
    qc.invalidateQueries({ queryKey: ['assembly'] });
    qc.invalidateQueries({ queryKey: ['store'] });
    onChanged?.();
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assemblyApi.remove(id),
    onSuccess: invalidate,
    onError: (err) => Alert.alert('Error', err instanceof ApiError ? friendlyMessage(err) : 'Delete failed'),
  });

  const confirmDelete = (record: AssemblyListRecord) =>
    Alert.alert('Delete Record', `Delete this assembly entry (${producedSets(record)} sets)?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(record.id) },
    ]);

  if (records.length === 0) {
    return <AppText tone="muted">No assembly records for this selection.</AppText>;
  }

  const groups = groupAssemblyRecords(records, headingFor);
  return (
    <View style={{ gap: spacing(3) }}>
      {groups.map((sg) => {
        const shiftKey = sg.shift;
        const isShiftOpen = expandedShift === shiftKey;
        const shiftTotal = sg.items.reduce((s, l) => s + l.totalSets, 0);
        return (
          <Card key={shiftKey}>
            <Pressable
              onPress={() => setExpandedShift(isShiftOpen ? null : shiftKey)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing(2) }}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <View>
                <AppText variant="h3">Shift {SHIFT_LABEL(sg.shift)}</AppText>
                <AppText variant="caption" tone="muted">
                  {sg.items.length} item code{sg.items.length !== 1 ? 's' : ''} · {shiftTotal.toLocaleString()} sets
                </AppText>
              </View>
              <AppText style={{ fontSize: 22, color: colors.textMuted }}>{isShiftOpen ? '▾' : '▸'}</AppText>
            </Pressable>

            {isShiftOpen && sg.items.map((ig) => {
              const lineKey = `${shiftKey}|${ig.key}`;
              const isLineOpen = expandedLine === lineKey;
              return (
                <View
                  key={lineKey}
                  style={{ marginTop: spacing(2), borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}
                >
                  <Pressable
                    onPress={() => setExpandedLine(isLineOpen ? null : lineKey)}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceAlt, padding: spacing(3) }}
                    hitSlop={{ top: 4, bottom: 4 }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText weight="700" style={{ fontSize: 15 }}>{ig.heading}</AppText>
                      <AppText variant="caption" weight="600" style={{ color: colors.status.success.fg, marginTop: 2 }}>
                        {ig.totalSets.toLocaleString()} sets
                        {ig.totalRejected > 0 ? ` · ${ig.totalRejected.toLocaleString()} rej` : ''}
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'center', paddingLeft: spacing(2) }}>
                      <AppText variant="caption" tone="muted">
                        {ig.records.length} {ig.records.length === 1 ? 'entry' : 'entries'}
                      </AppText>
                      <AppText variant="caption" style={{ color: colors.primary, marginTop: 1 }}>
                        {isLineOpen ? 'hide' : editable ? 'edit / delete' : 'view'}
                      </AppText>
                      <AppText style={{ fontSize: 20, color: colors.textMuted, marginTop: 2 }}>{isLineOpen ? '▾' : '▸'}</AppText>
                    </View>
                  </Pressable>

                  {isLineOpen && ig.records.map((r) => {
                    const isEditing = editingRecordId === r.id;
                    const timeLeft = editTimeRemaining(r.createdAt);
                    const canModify = editable && !!timeLeft && r.canEdit !== false;
                    const total = producedSets(r);
                    return (
                      <View
                        key={r.id}
                        style={{ padding: spacing(3), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}
                      >
                        <View style={{ marginBottom: canModify ? spacing(2) : 0 }}>
                          <AppText style={{ fontSize: 14 }}>
                            <AppText weight="600" style={{ color: colors.status.success.fg }}>{total.toLocaleString()}</AppText> sets
                            {r.extraSets ? <AppText variant="caption" tone="muted">{`  (${r.assembledSets} order + ${r.extraSets} extra)`}</AppText> : null}
                            {r.rejectedQuantity ? (
                              <>
                                {' · '}
                                <AppText weight="600" style={{ color: colors.status.danger.fg }}>{r.rejectedQuantity}</AppText>
                                {' rej'}
                              </>
                            ) : null}
                          </AppText>
                          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                            {[
                              r.operatorCount ? `${r.operatorCount} workers` : null,
                              new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                              r.assemblyLine && r.assemblyLine !== '—' ? r.assemblyLine : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </AppText>
                          {(r.consumption?.length ?? 0) > 0 ? (
                            <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                              Consumed: {(r.consumption ?? []).map((c) => `${c.quantity} ${c.partName}`).join(' · ')}
                            </AppText>
                          ) : null}
                          {r.remarks ? (
                            <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>“{r.remarks}”</AppText>
                          ) : null}
                          {editable ? (
                            canModify ? (
                              <AppText variant="caption" style={{ color: colors.status.info.fg, marginTop: 2 }}>{timeLeft} left to edit</AppText>
                            ) : (
                              <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>Edit window closed</AppText>
                            )
                          ) : null}
                        </View>

                        {canModify ? (
                          <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                            <Pressable
                              onPress={() => setEditingRecordId(isEditing ? null : r.id)}
                              style={{ flex: 1, backgroundColor: colors.status.info.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.status.info.fg, paddingVertical: spacing(3), alignItems: 'center' }}
                            >
                              <AppText weight="700" style={{ color: colors.status.info.fg, fontSize: 15 }}>{isEditing ? '✕  Cancel Edit' : '✎  Edit'}</AppText>
                            </Pressable>
                            <Pressable
                              onPress={() => confirmDelete(r)}
                              style={{ flex: 1, backgroundColor: colors.status.danger.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.status.danger.fg, paddingVertical: spacing(3), alignItems: 'center' }}
                            >
                              <AppText weight="700" style={{ color: colors.status.danger.fg, fontSize: 15 }}>🗑  Delete</AppText>
                            </Pressable>
                          </View>
                        ) : null}

                        {isEditing ? (
                          <AssemblyEditPanel
                            record={r}
                            onClose={() => setEditingRecordId(null)}
                            onSaved={() => { setEditingRecordId(null); invalidate(); }}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </Card>
        );
      })}
    </View>
  );
}
