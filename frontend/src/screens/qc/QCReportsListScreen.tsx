import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl, View } from 'react-native';

import { qcReportsApi, type QCListParams } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCReport } from '@/api/types';
import { AppText, QueryBoundary, Screen } from '@/components';
import { PressableScale } from '@/components/premium';
import { STATUS_META, formatDateTime } from '@/components/qc';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useTheme } from '@/theme/ThemeProvider';
import type { QCStackParamList } from './navTypes';

type Nav = NativeStackNavigationProp<QCStackParamList, 'QCReportsList'>;

// A plain list of QC cases — no search, filters or sorting. Each case shows only its
// QC status (Open / Closed); tap to open the case (status + comments).
export function QCReportsListScreen() {
  const { spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<QCStackParamList, 'QCReportsList'>>();
  const { department, orderId } = params;

  const listParams: QCListParams = { department, orderId, limit: 100 };
  const query = useQuery({
    queryKey: queryKeys.qc.reports(listParams),
    queryFn: () => qcReportsApi.list(listParams),
  });

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <AppText variant="h1" style={{ marginBottom: spacing(4) }}>
        {params.title ?? 'QC Cases'}
      </AppText>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
        isEmpty={(d) => d.data.length === 0}
        emptyTitle="No QC cases"
        emptyMessage="Cases appear here once a QC report is uploaded."
      >
        {(d) => (
          <View style={{ gap: spacing(3) }}>
            {d.data.map((r) => (
              <CaseCard
                key={r.id}
                report={r}
                onPress={() => navigation.navigate('QCReportDetail', { reportId: r.id })}
              />
            ))}
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}

// A single QC case: thumbnail, defect line, Open/Closed status. Nothing more.
function CaseCard({ report, onPress }: { report: QCReport; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const st = STATUS_META[report.status];
  const thumb = report.photos[0]?.url ? resolveMediaUrl(report.photos[0].url) : undefined;

  return (
    <PressableScale onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: 96, height: 96, backgroundColor: colors.surfaceAlt }}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <AppText style={{ fontSize: 28 }}>📝</AppText>
            </View>
          )}
        </View>
        <View style={{ flex: 1, padding: spacing(3), justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText weight="600" numberOfLines={1} style={{ flex: 1, marginRight: spacing(2) }}>
              {report.defects.length ? report.defects.join(', ') : 'Defect report'}
            </AppText>
            <AppText variant="caption" weight="700" style={{ color: colors.status[st.tone].fg }}>
              {st.label}
            </AppText>
          </View>
          <AppText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: spacing(1) }}>
            {report.submittedByName ?? 'Engineer'} · {formatDateTime(report.createdAt)}
            {report.comments.length ? `  · 💬 ${report.comments.length}` : ''}
          </AppText>
        </View>
      </View>
    </PressableScale>
  );
}
