import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { purchaseOrdersApi } from '@/api/endpoints/purchaseOrders';
import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCActivePO, QCDepartment } from '@/api/types';
import { AppText, Button, Card, PressableScale, Screen } from '@/components';
import { useMouldingSession } from '@/features/moulding/MouldingSessionContext';
import { useTheme } from '@/theme/ThemeProvider';
import type { QCStackParamList } from './navTypes';
import { useQCCapabilities, type QCCapabilities } from './useQCCapabilities';

type Nav = NativeStackNavigationProp<QCStackParamList, 'DepartmentQC'>;
type Mode = 'active' | 'archived';

const DEPT_LABEL: Record<QCDepartment, string> = { moulding: 'Moulding', assembly: 'Assembly' };

// One PO in a department's QC list: tapping it reveals its Item Code cards. Authors (QC
// Engineer) get Create + "Done QC" controls; read-only viewers (moulding/assembly engineers)
// only get "View QC Reports". Context is inherited PO → Item Code — no re-selecting.
function POCard({
  po,
  mode,
  department,
  caps,
  initiallyOpen,
}: {
  po: QCActivePO;
  mode: Mode;
  department: QCDepartment;
  caps: QCCapabilities;
  initiallyOpen?: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const [open, setOpen] = useState(!!initiallyOpen);

  const detail = useQuery({
    queryKey: queryKeys.purchaseOrder(po.id),
    queryFn: () => purchaseOrdersApi.get(po.id),
    enabled: open,
  });

  const closeMut = useMutation({
    mutationFn: () => qcReportsApi.closePO(po.id, department),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.qc.activePOs(department) });
      qc.invalidateQueries({ queryKey: queryKeys.qc.archivedPOs(department) });
    },
  });

  const confirmDone = () =>
    Alert.alert(
      `Done with ${DEPT_LABEL[department]} QC for this PO?`,
      `Are you sure? Once completed, ${po.poNumber ?? 'this PO'} moves to QC Archive. Existing reports stay viewable.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Done with QC', style: 'destructive', onPress: () => closeMut.mutate() },
      ]
    );

  return (
    <Card>
      <PressableScale onPress={() => setOpen((o) => !o)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="h3">{po.poNumber ?? 'PO'}</AppText>
            <AppText variant="caption" tone="muted">
              {po.customerName ?? '—'} · {po.itemCount} item code{po.itemCount === 1 ? '' : 's'}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="caption" tone="muted">
              {po.reportCount} report{po.reportCount === 1 ? '' : 's'}
              {po.openCount ? `  ·  ${po.openCount} open` : ''}
            </AppText>
            <AppText style={{ color: colors.textMuted, fontSize: 18 }}>{open ? '▾' : '▸'}</AppText>
          </View>
        </View>
      </PressableScale>

      {open ? (
        <View style={{ marginTop: spacing(3), gap: spacing(2) }}>
          {detail.isLoading ? (
            <AppText tone="muted" variant="caption">Loading item codes…</AppText>
          ) : (
            (detail.data?.jobs ?? []).map((job) => (
              <View key={job.id} style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing(3) }}>
                <AppText weight="700" style={{ fontSize: 15 }}>{job.itemCode ?? '—'}</AppText>
                <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>{job.productName}</AppText>
                <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                  {mode === 'active' && caps.canCreate ? (
                    <Button
                      label="＋ Create QC Report"
                      onPress={() =>
                        navigation.navigate('CreateQCReport', {
                          department,
                          orderId: job.id,
                          customerId: job.customerId ?? po.customerId,
                          productId: job.productId ?? undefined,
                          purchaseOrderId: po.id,
                        })
                      }
                      style={{ flex: 1 }}
                    />
                  ) : null}
                  <Button
                    label="View QC Reports"
                    variant="secondary"
                    onPress={() =>
                      navigation.navigate('QCReportsList', {
                        department,
                        orderId: job.id,
                        title: job.itemCode ?? 'QC Reports',
                      })
                    }
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ))
          )}

          {mode === 'active' && caps.canArchive ? (
            <View style={{ marginTop: spacing(2) }}>
              <Button
                label={closeMut.isPending ? 'Finishing…' : `Done with ${DEPT_LABEL[department]} QC for this PO`}
                variant="danger"
                loading={closeMut.isPending}
                onPress={confirmDone}
              />
              <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2), textAlign: 'center' }}>
                Moves this PO to QC Archive. Reports stay viewable to Admin and the customer.
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// A department's QC screen (Moulding QC / Assembly QC). Same UI for every role — the
// per-report author controls are gated by QC capabilities (req #7/#8/#11).
export function DepartmentQCScreen({ department }: { department: QCDepartment }) {
  const { colors, spacing, radius } = useTheme();
  const { active } = useMouldingSession();
  const caps = useQCCapabilities();
  const [mode, setMode] = useState<Mode>('active');
  const label = DEPT_LABEL[department];

  const query = useQuery({
    queryKey: mode === 'active' ? queryKeys.qc.activePOs(department) : queryKeys.qc.archivedPOs(department),
    queryFn: () => (mode === 'active' ? qcReportsApi.activePOs(department) : qcReportsApi.archivedPOs(department)),
  });
  const pos = query.data ?? [];
  const isArchived = mode === 'archived';

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <AppText variant="h1" style={{ marginBottom: spacing(1) }}>
        {label} QC
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(3) }}>
        {caps.canCreate
          ? 'Report defects by Purchase Order → Item Code — no re-selecting.'
          : 'View defect reports by Purchase Order → Item Code (read-only).'}
      </AppText>

      {/* Active / Archived toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing(4) }}>
        {(['active', 'archived'] as Mode[]).map((m) => {
          const on = mode === m;
          return (
            <PressableScale key={m} onPress={() => setMode(m)} style={{ flex: 1 }}>
              <View style={{ backgroundColor: on ? colors.primary : 'transparent', borderRadius: radius.pill, paddingVertical: spacing(2), alignItems: 'center' }}>
                <AppText weight="700" style={{ color: on ? colors.primaryText : colors.textMuted }}>
                  {m === 'active' ? 'Active QC' : 'QC Archive'}
                </AppText>
              </View>
            </PressableScale>
          );
        })}
      </View>

      {query.isLoading ? (
        <AppText tone="muted">Loading…</AppText>
      ) : pos.length === 0 ? (
        <Card>
          <AppText style={{ fontSize: 32, marginBottom: spacing(2) }}>{isArchived ? '📁' : '🔍'}</AppText>
          <AppText weight="600" style={{ marginBottom: spacing(1) }}>
            {isArchived ? 'No archived POs' : 'No POs in QC'}
          </AppText>
          <AppText tone="muted">
            {isArchived
              ? `POs appear here after "Done with ${label} QC for this PO". Report history is preserved.`
              : `Purchase orders with ${label.toLowerCase()} activity appear here so defects can be documented per item code.`}
          </AppText>
        </Card>
      ) : (
        <View style={{ gap: spacing(3) }}>
          {pos.map((po) => (
            <POCard
              key={po.id}
              po={po}
              mode={mode}
              department={department}
              caps={caps}
              initiallyOpen={!isArchived && active?.purchaseOrderId === po.id}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
