import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { purchaseOrdersApi } from '@/api/endpoints/purchaseOrders';
import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCDepartment } from '@/api/types';
import { AppText, Button, Card, PressableScale, Screen } from '@/components';
import { ItemCodeReportBadge } from '@/components/qc';
import { useTheme } from '@/theme/ThemeProvider';

const DEPT_LABEL: Record<QCDepartment, string> = { moulding: 'Moulding', assembly: 'Assembly' };

type AdminQCPOParams = {
  AdminQCPO: {
    purchaseOrderId: string;
    poNumber?: string | null;
    customerName?: string | null;
    department?: QCDepartment;
  };
};

// Admin QC — one Purchase Order. Pick Moulding QC or Assembly QC, then browse that
// department's defect reports per item code. Read-only: no create / archive controls.
export function AdminQCPOScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AdminQCPOParams, 'AdminQCPO'>>();
  const { purchaseOrderId, poNumber, customerName } = params;

  // Land on the department the admin was browsing; they can still flip here.
  const [department, setDepartment] = useState<QCDepartment>(params.department ?? 'moulding');

  const detail = useQuery({
    queryKey: queryKeys.purchaseOrder(purchaseOrderId),
    queryFn: () => purchaseOrdersApi.get(purchaseOrderId),
  });
  const jobs = detail.data?.jobs ?? [];

  // Per-item-code report counts for the selected department, so each item code shows whether
  // (and how many) reports it has — the admin sees where reports are without opening each one.
  const countsQuery = useQuery({
    queryKey: queryKeys.qc.orderReportCounts(department),
    queryFn: () => qcReportsApi.orderReportCounts(department),
  });
  const countsByOrder = React.useMemo(() => {
    const m = new Map<string, { reportCount: number; openCount: number }>();
    for (const c of countsQuery.data ?? []) {
      m.set(c.orderId, { reportCount: c.reportCount, openCount: c.openCount });
    }
    return m;
  }, [countsQuery.data]);

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 140 }}
      refreshControl={
        <RefreshControl
          refreshing={detail.isRefetching || countsQuery.isRefetching}
          onRefresh={() => {
            detail.refetch();
            countsQuery.refetch();
          }}
        />
      }
    >
      <AppText variant="h1" style={{ marginBottom: spacing(1) }}>
        {poNumber ?? 'Purchase Order'}
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        {customerName ?? '—'} · Select a department, then an item code to view its QC reports.
      </AppText>

      {/* Moulding QC / Assembly QC toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing(4) }}>
        {(['moulding', 'assembly'] as QCDepartment[]).map((d) => {
          const on = department === d;
          return (
            <PressableScale key={d} onPress={() => setDepartment(d)} style={{ flex: 1 }}>
              <View style={{ backgroundColor: on ? colors.primary : 'transparent', borderRadius: radius.pill, paddingVertical: spacing(2), alignItems: 'center' }}>
                <AppText weight="700" style={{ color: on ? colors.primaryText : colors.textMuted }}>
                  {DEPT_LABEL[d]} QC
                </AppText>
              </View>
            </PressableScale>
          );
        })}
      </View>

      {detail.isLoading ? (
        <AppText tone="muted">Loading item codes…</AppText>
      ) : jobs.length === 0 ? (
        <Card>
          <AppText style={{ fontSize: 32, marginBottom: spacing(2) }}>🔍</AppText>
          <AppText weight="600" style={{ marginBottom: spacing(1) }}>No item codes</AppText>
          <AppText tone="muted">This purchase order has no item codes.</AppText>
        </Card>
      ) : (
        <View style={{ gap: spacing(2) }}>
          {jobs.map((job) => (
            <View key={job.id} style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing(3) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(2), marginBottom: spacing(2) }}>
                <View style={{ flex: 1 }}>
                  <AppText weight="700" style={{ fontSize: 15 }}>{job.itemCode ?? '—'}</AppText>
                  <AppText variant="caption" tone="muted">{job.productName}</AppText>
                </View>
                <ItemCodeReportBadge
                  reportCount={countsByOrder.get(job.id)?.reportCount ?? 0}
                  openCount={countsByOrder.get(job.id)?.openCount ?? 0}
                />
              </View>
              <Button
                label={`View ${DEPT_LABEL[department]} QC Reports`}
                variant="secondary"
                onPress={() =>
                  navigation.navigate('QCReportsList', {
                    department,
                    orderId: job.id,
                    title: `${job.itemCode ?? 'QC'} · ${DEPT_LABEL[department]}`,
                  })
                }
              />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
