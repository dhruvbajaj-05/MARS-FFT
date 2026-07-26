import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { purchaseOrdersApi } from '@/api/endpoints/purchaseOrders';
import { queryKeys } from '@/api/queryKeys';
import type { QCDepartment } from '@/api/types';
import { AppText, Button, Card, PressableScale, Screen } from '@/components';
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

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={detail.refetch} />}
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
              <AppText weight="700" style={{ fontSize: 15 }}>{job.itemCode ?? '—'}</AppText>
              <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>{job.productName}</AppText>
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
