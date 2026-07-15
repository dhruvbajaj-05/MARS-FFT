import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { qcReportsApi, type QCListParams } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCReport, QCStatusValue } from '@/api/types';
import { AppText, QueryBoundary, Screen } from '@/components';
import { PressableScale, StatusPill } from '@/components/premium';
import { SEVERITY_META, STATUS_META, STATUS_ORDER, formatDateTime } from '@/components/qc';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useTheme } from '@/theme/ThemeProvider';
import type { QCStackParamList } from './navTypes';

type Nav = NativeStackNavigationProp<QCStackParamList, 'QCReportsList'>;

export function QCReportsListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<QCStackParamList, 'QCReportsList'>>();
  const { department, orderId, search: initialSearch } = params;

  const [search, setSearch] = useState(initialSearch ?? '');
  const [statusFilter, setStatusFilter] = useState<QCStatusValue | null>(null);

  const listParams: QCListParams = {
    department,
    orderId,
    search: search.trim() || undefined,
    status: statusFilter ?? undefined,
    limit: 100,
  };
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
      <AppText variant="h1" style={{ marginBottom: spacing(3) }}>
        {params.title ?? 'Previous Reports'}
      </AppText>

      {/* Search */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.pill,
          paddingHorizontal: spacing(4),
          marginBottom: spacing(3),
        }}
      >
        <AppText style={{ fontSize: 16 }}>🔎</AppText>
        <TextInput
          style={{ flex: 1, color: colors.text, paddingVertical: spacing(3), paddingHorizontal: spacing(2) }}
          value={search}
          onChangeText={setSearch}
          placeholder="Search defect, machine, engineer…"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Status filter chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(4) }}>
        <FilterChip label="All" active={statusFilter === null} onPress={() => setStatusFilter(null)} />
        {STATUS_ORDER.map((s) => (
          <FilterChip
            key={s}
            label={STATUS_META[s].label}
            active={statusFilter === s}
            onPress={() => setStatusFilter(s)}
          />
        ))}
      </View>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
        isEmpty={(d) => d.data.length === 0}
        emptyTitle="No reports found"
        emptyMessage="Try clearing filters or create a new QC report."
      >
        {(d) => (
          <View style={{ gap: spacing(3) }}>
            {d.data.map((r) => (
              <ReportCard
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

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale onPress={onPress}>
      <View
        style={{
          backgroundColor: active ? colors.primary : colors.surfaceAlt,
          borderRadius: radius.pill,
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(2),
        }}
      >
        <AppText variant="caption" weight="700" style={{ color: active ? colors.primaryText : colors.textMuted }}>
          {label}
        </AppText>
      </View>
    </PressableScale>
  );
}

// Expandable card (no tables): tap to expand summary, tap "Open" to view full report.
function ReportCard({ report, onPress }: { report: QCReport; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_META[report.severity];
  const st = STATUS_META[report.status];
  const thumb = report.photos[0]?.url ? resolveMediaUrl(report.photos[0].url) : undefined;

  return (
    <PressableScale onPress={() => setExpanded((e) => !e)}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: 96, height: 96, backgroundColor: colors.surfaceAlt }}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <AppText style={{ fontSize: 28 }}>📝</AppText>
              </View>
            )}
          </View>
          <View style={{ flex: 1, padding: spacing(3) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <StatusPill label={sev.label} tone={sev.tone} />
              <AppText variant="caption" weight="700" style={{ color: colors.status[st.tone].fg }}>
                {st.label}
              </AppText>
            </View>
            <AppText weight="600" numberOfLines={1} style={{ marginTop: spacing(1) }}>
              {report.defects.length ? report.defects.join(', ') : 'Defect report'}
            </AppText>
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {report.submittedByName ?? 'Engineer'} · {formatDateTime(report.createdAt)}
            </AppText>
            <AppText variant="caption" tone="muted">
              {[report.machine, report.mould].filter(Boolean).join(' · ') || '—'}
              {report.photos.length ? `  · 📸 ${report.photos.length}` : ''}
            </AppText>
          </View>
        </View>

        {expanded ? (
          <View style={{ padding: spacing(3), paddingTop: 0 }}>
            {report.description ? (
              <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }} numberOfLines={3}>
                {report.description}
              </AppText>
            ) : null}
            <PressableScale onPress={onPress}>
              <View
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: radius.md,
                  paddingVertical: spacing(2),
                  alignItems: 'center',
                }}
              >
                <AppText weight="700" style={{ color: colors.primaryText }}>
                  Open Full Report
                </AppText>
              </View>
            </PressableScale>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}
