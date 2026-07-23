import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { mouldingApi } from '@/api/endpoints/moulding';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Banner, Button, Card, FormField, MultiCheckbox } from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useTheme } from '@/theme/ThemeProvider';

// A moulding record as far as this list is concerned. Both the engineer's MouldingRecord and
// the admin's AdminMouldingRecord satisfy it, so the SAME grouped UI renders for both — the
// only difference is `editable` (engineers edit/delete their own entries; admin is read-only).
export interface MouldingListRecord {
  id: string;
  orderId: string | null;
  moldName: string;
  partName: string;
  machineNumber: string;
  shift: 'A' | 'B' | 'C';
  cavity: number;
  shotsDone: number;
  rejectedShots: number;
  goodParts: number;
  rejectionReasons: string[];
  rejectionReason?: string | null;
  comments?: string | null;
  createdAt: string;
  canEdit?: boolean;
}

type CavityGroup = {
  cavity: number;
  partName: string;
  moldName: string;
  totalShots: number;
  totalRejectedShots: number;
  goodPieces: number;
  records: MouldingListRecord[];
};
type ShiftGroup = {
  shift: string;
  cavities: CavityGroup[];
};

function groupMouldingRecords(records: MouldingListRecord[]): ShiftGroup[] {
  const shifts: Record<string, Record<string, CavityGroup>> = {};

  for (const r of records) {
    const s = r.shift ?? '?';
    const key = `${r.partName}|${r.cavity}`;

    if (!shifts[s]) shifts[s] = {};
    if (!shifts[s][key]) {
      shifts[s][key] = {
        cavity: r.cavity,
        partName: r.partName,
        moldName: r.moldName,
        totalShots: 0,
        totalRejectedShots: 0,
        goodPieces: 0,
        records: [],
      };
    }
    const g = shifts[s][key];
    g.totalShots += r.shotsDone;
    g.totalRejectedShots += r.rejectedShots ?? 0;
    g.goodPieces += r.goodParts;
    g.records.push(r);
  }

  return Object.entries(shifts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([shift, cavities]) => ({
      shift,
      // Sort by cavity descending (highest cavity first)
      cavities: Object.values(cavities).sort((a, b) => b.cavity - a.cavity),
    }));
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

// ---- Inline edit panel for a single moulding record (engineers only) ----
function MouldingEditPanel({
  record,
  reasons,
  onClose,
  onSaved,
}: {
  record: MouldingListRecord;
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
    if (!allReasons.includes(r)) {
      setAllReasons((prev) => [...prev, r].sort());
      mouldingApi.saveRejectionReason(r).catch(() => {});
    }
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

// Shared moulding records renderer — Shift → Cavity → individual entries. The engineer's
// "My Records" page and the admin records page render this IDENTICALLY; `editable` toggles
// the per-entry Edit/Delete controls (engineers can modify their own within 12h; admin views
// read-only). `itemCodeFor` resolves an entry's item code for the record subtitle.
export function MouldingRecordsList({
  records,
  itemCodeFor,
  editable = false,
  reasons = [],
  onChanged,
}: {
  records: MouldingListRecord[];
  itemCodeFor: (orderId?: string | null) => string;
  editable?: boolean;
  reasons?: string[];
  onChanged?: () => void;
}) {
  const { spacing, colors } = useTheme();
  const qc = useQueryClient();

  const [expandedShift, setExpandedShift] = useState<string | null>(null);
  const [expandedCavity, setExpandedCavity] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.dept('moulding').mine({}) });
    qc.invalidateQueries({ queryKey: ['moulding'] });
    // Edits/deletes re-derive Finished/Surplus/Pending on the backend — refresh the store view.
    qc.invalidateQueries({ queryKey: ['store'] });
    onChanged?.();
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mouldingApi.delete(id),
    onSuccess: invalidate,
    onError: (err) => {
      const msg = err instanceof ApiError ? friendlyMessage(err) : 'Delete failed';
      Alert.alert('Error', msg);
    },
  });

  const confirmDelete = (record: MouldingListRecord) => {
    Alert.alert('Delete Record', `Delete this production entry (${record.shotsDone} shots · ${record.goodParts} good)?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(record.id) },
    ]);
  };

  if (records.length === 0) {
    return <AppText tone="muted">No moulding records for this selection.</AppText>;
  }

  const groups = groupMouldingRecords(records);
  return (
    <View style={{ gap: spacing(3) }}>
      {groups.map((sg) => {
        const shiftKey = sg.shift;
        const isShiftOpen = expandedShift === shiftKey;
        const shiftTotal = sg.cavities.reduce((s, c) => s + c.goodPieces, 0);
        return (
          <Card key={shiftKey}>
            {/* Shift header — large tap area */}
            <Pressable
              onPress={() => setExpandedShift(isShiftOpen ? null : shiftKey)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: spacing(2),
              }}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <View>
                <AppText variant="h3">
                  Shift {sg.shift === 'A' ? 'A  (08:00–16:00)' : sg.shift === 'B' ? 'B  (16:00–00:00)' : 'C  (00:00–08:00)'}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {sg.cavities.length} mould{sg.cavities.length !== 1 ? 's' : ''} · {shiftTotal.toLocaleString()} good pieces
                </AppText>
              </View>
              <AppText style={{ fontSize: 22, color: colors.textMuted }}>
                {isShiftOpen ? '▾' : '▸'}
              </AppText>
            </Pressable>

            {/* Cavity groups */}
            {isShiftOpen && sg.cavities.map((cg) => {
              const cavKey = `${shiftKey}|${cg.partName}|${cg.cavity}`;
              const isCavOpen = expandedCavity === cavKey;
              return (
                <View
                  key={cavKey}
                  style={{
                    marginTop: spacing(2),
                    borderRadius: 10,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {/* Cavity summary row — tap to expand individual records */}
                  <Pressable
                    onPress={() => setExpandedCavity(isCavOpen ? null : cavKey)}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: colors.surfaceAlt,
                      padding: spacing(3),
                    }}
                    hitSlop={{ top: 4, bottom: 4 }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText weight="700" style={{ fontSize: 15 }}>
                        {cg.cavity} Cavity — {cg.partName}
                      </AppText>
                      <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                        {cg.totalShots.toLocaleString()} shots · {cg.totalRejectedShots.toLocaleString()} rej
                      </AppText>
                      <AppText
                        variant="caption"
                        weight="600"
                        style={{ color: colors.status.success.fg, marginTop: 2 }}
                      >
                        {cg.goodPieces.toLocaleString()} good pieces
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'center', paddingLeft: spacing(2) }}>
                      <AppText variant="caption" tone="muted">
                        {cg.records.length} {cg.records.length === 1 ? 'entry' : 'entries'}
                      </AppText>
                      <AppText variant="caption" style={{ color: colors.primary, marginTop: 1 }}>
                        {isCavOpen ? 'hide' : editable ? 'edit / delete' : 'view'}
                      </AppText>
                      <AppText style={{ fontSize: 20, color: colors.textMuted, marginTop: 2 }}>
                        {isCavOpen ? '▾' : '▸'}
                      </AppText>
                    </View>
                  </Pressable>

                  {/* Individual records */}
                  {isCavOpen && cg.records.map((r) => {
                    const isEditing = editingRecordId === r.id;
                    const timeLeft = editTimeRemaining(r.createdAt);
                    const canModify = editable && !!timeLeft;
                    return (
                      <View
                        key={r.id}
                        style={{
                          padding: spacing(3),
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                          backgroundColor: colors.surface,
                        }}
                      >
                        {/* Record info */}
                        <View style={{ marginBottom: canModify ? spacing(2) : 0 }}>
                          <AppText style={{ fontSize: 14 }}>
                            <AppText weight="600">{r.shotsDone.toLocaleString()}</AppText> shots
                            {r.rejectedShots ? (
                              <>
                                {' · '}
                                <AppText weight="600" style={{ color: colors.status.danger.fg }}>
                                  {r.rejectedShots}
                                </AppText>
                                {' rej'}
                              </>
                            ) : null}
                            {' · '}
                            <AppText weight="600" style={{ color: colors.status.success.fg }}>
                              {r.goodParts.toLocaleString()}
                            </AppText>
                            {' good'}
                          </AppText>
                          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                            Machine {r.machineNumber} · {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {itemCodeFor(r.orderId)}
                          </AppText>
                          {r.rejectionReasons.length > 0 ? (
                            <AppText variant="caption" style={{ color: colors.status.danger.fg, marginTop: 2 }}>
                              Defects: {r.rejectionReasons.join(', ')}
                            </AppText>
                          ) : null}
                          {editable ? (
                            canModify ? (
                              <AppText variant="caption" style={{ color: colors.status.info.fg, marginTop: 2 }}>
                                {timeLeft} left to edit
                              </AppText>
                            ) : (
                              <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                                Edit window closed
                              </AppText>
                            )
                          ) : null}
                        </View>

                        {/* Edit / Delete — big, obvious action buttons while the 12h window is open */}
                        {canModify ? (
                          <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                            <Pressable
                              onPress={() => setEditingRecordId(isEditing ? null : r.id)}
                              style={{
                                flex: 1,
                                backgroundColor: colors.status.info.bg,
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: colors.status.info.fg,
                                paddingVertical: spacing(3),
                                alignItems: 'center',
                              }}
                            >
                              <AppText weight="700" style={{ color: colors.status.info.fg, fontSize: 15 }}>
                                {isEditing ? '✕  Cancel Edit' : '✎  Edit'}
                              </AppText>
                            </Pressable>
                            <Pressable
                              onPress={() => confirmDelete(r)}
                              style={{
                                flex: 1,
                                backgroundColor: colors.status.danger.bg,
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: colors.status.danger.fg,
                                paddingVertical: spacing(3),
                                alignItems: 'center',
                              }}
                            >
                              <AppText weight="700" style={{ color: colors.status.danger.fg, fontSize: 15 }}>
                                🗑  Delete
                              </AppText>
                            </Pressable>
                          </View>
                        ) : null}

                        {isEditing ? (
                          <MouldingEditPanel
                            record={r}
                            reasons={reasons}
                            onClose={() => setEditingRecordId(null)}
                            onSaved={() => {
                              setEditingRecordId(null);
                              invalidate();
                            }}
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
