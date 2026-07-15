import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { View } from 'react-native';

import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCDepartment } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale, shadow } from '@/components/premium';
import { AppText } from '@/components/Text';

// A one-tap shortcut into the centralized QC module (spec §Department Integration).
// Shows the current open-defect count and deep-links to the QC tab with the right
// department preselected — keeping all quality data centralized (no duplicated pages).
export function QCIssuesCard({
  department,
  tabName = 'QC',
}: {
  department: QCDepartment;
  tabName?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const navigation = useNavigation<any>();

  const params = { department, status: 'open' as const, limit: 1 };
  const query = useQuery({
    queryKey: queryKeys.qc.reports({ ...params, badge: true }),
    queryFn: () => qcReportsApi.list(params),
  });
  const open = query.data?.pagination.total ?? 0;

  // Switch to the department's QC tab (its root is the active-order QC screen).
  const go = () => navigation.navigate(tabName);

  return (
    <PressableScale onPress={go}>
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: open > 0 ? colors.status.danger.bg : colors.surface,
            borderRadius: radius.lg,
            padding: spacing(4),
            borderWidth: 1,
            borderColor: open > 0 ? colors.status.danger.fg : colors.border,
            gap: spacing(3),
          },
          shadow('sm'),
        ]}
      >
        <AppText style={{ fontSize: 26 }}>⚠️</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="h3" style={{ color: open > 0 ? colors.status.danger.fg : colors.text }}>
            QC Issues{open > 0 ? ` (${open})` : ''}
          </AppText>
          <AppText variant="caption" tone="muted">
            {open > 0 ? 'Open defects need attention' : 'Report or review defects'}
          </AppText>
        </View>
        <AppText style={{ fontSize: 22, color: colors.textMuted }}>›</AppText>
      </View>
    </PressableScale>
  );
}
