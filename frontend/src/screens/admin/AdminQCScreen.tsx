import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCDepartment } from '@/api/types';
import { AppText, Card, PressableScale, Screen } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

type Mode = 'active' | 'archived';

const DEPT_LABEL: Record<QCDepartment, string> = { moulding: 'Moulding', assembly: 'Assembly' };

// Admin QC browser (req #6), PO-first. Two toggles mirror the engineer QC tabs so archives
// stay per-department: "Done QC for this PO" in Moulding archives ONLY the Moulding side (and
// likewise Assembly) — the admin sees each department's Active + Archive independently.
export function AdminQCScreen() {
  const { colors, spacing } = useTheme();
  const navigation = useNavigation<any>();

  const [department, setDepartment] = useState<QCDepartment>('moulding');
  const [mode, setMode] = useState<Mode>('active');

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
        Quality Control
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(3) }}>
        Browse defect reports by Purchase Order. Moulding and Assembly archive separately.
      </AppText>

      {/* Moulding QC / Assembly QC */}
      <Toggle
        options={(['moulding', 'assembly'] as QCDepartment[]).map((d) => ({ key: d, label: `${DEPT_LABEL[d]} QC` }))}
        value={department}
        onChange={(v) => setDepartment(v as QCDepartment)}
      />
      {/* Active / Archive */}
      <Toggle
        options={[
          { key: 'active', label: 'Active QC' },
          { key: 'archived', label: 'QC Archive' },
        ]}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
      />

      <View style={{ height: spacing(2) }} />

      {query.isLoading ? (
        <AppText tone="muted">Loading…</AppText>
      ) : pos.length === 0 ? (
        <Card>
          <AppText style={{ fontSize: 32, marginBottom: spacing(2) }}>{isArchived ? '📁' : '🔍'}</AppText>
          <AppText weight="600" style={{ marginBottom: spacing(1) }}>
            {isArchived ? `No archived ${DEPT_LABEL[department]} POs` : `No POs in ${DEPT_LABEL[department]} QC`}
          </AppText>
          <AppText tone="muted">
            {isArchived
              ? `POs appear here after "Done with ${DEPT_LABEL[department]} QC for this PO". Reports stay viewable.`
              : `Purchase orders with ${DEPT_LABEL[department].toLowerCase()} activity appear here.`}
          </AppText>
        </Card>
      ) : (
        <View style={{ gap: spacing(3) }}>
          {pos.map((po) => (
            <PressableScale
              key={po.id}
              onPress={() =>
                navigation.navigate('AdminQCPO', {
                  purchaseOrderId: po.id,
                  poNumber: po.poNumber,
                  customerName: po.customerName,
                  department,
                })
              }
            >
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{po.poNumber ?? 'PO'}</AppText>
                    <AppText variant="caption" tone="muted">
                      {po.customerName ?? '—'} · {po.reportCount} report{po.reportCount === 1 ? '' : 's'}
                      {po.openCount ? `  ·  ${po.openCount} open` : ''}
                    </AppText>
                  </View>
                  <AppText style={{ color: colors.textMuted, fontSize: 18 }}>›</AppText>
                </View>
              </Card>
            </PressableScale>
          ))}
        </View>
      )}
    </Screen>
  );
}

// A pill segmented control (matches the engineer QC tabs).
function Toggle({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing(3) }}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <PressableScale key={o.key} onPress={() => onChange(o.key)} style={{ flex: 1 }}>
            <View style={{ backgroundColor: on ? colors.primary : 'transparent', borderRadius: radius.pill, paddingVertical: spacing(2), alignItems: 'center' }}>
              <AppText weight="700" style={{ color: on ? colors.primaryText : colors.textMuted }}>
                {o.label}
              </AppText>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
