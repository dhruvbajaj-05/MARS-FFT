import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { qcReportsApi, type QCListParams } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCDepartment, QCReport, QCStatusValue } from '@/api/types';
import { AppText, PressableScale, QueryBoundary, Screen, Select, StatusPill } from '@/components';
import { SEVERITY_META, STATUS_META, STATUS_ORDER, formatDateTime } from '@/components/qc';
import { useCustomerProduct } from '@/screens/engineer/useCustomerProduct';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveMediaUrl } from '@/utils/mediaUrl';

type DateWindow = 'all' | '7' | '30';
const DEPARTMENTS: { value: QCDepartment | 'all'; label: string }[] = [
  { value: 'all', label: 'All depts' },
  { value: 'moulding', label: 'Moulding' },
  { value: 'assembly', label: 'Assembly' },
];

function dateFromFor(window: DateWindow): string | undefined {
  if (window === 'all') return undefined;
  const d = new Date();
  d.setDate(d.getDate() - Number(window));
  return d.toISOString();
}

// Admin QC browser (req #6): view EVERY uploaded QC defect report without entering the
// Moulding module, filterable by Company / Product / Order / Engineer / Machine / Date /
// Status. Engineer + Machine are covered by the free-text search (both are indexed on it).
export function AdminQCScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<any>();
  const cp = useCustomerProduct();

  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<QCDepartment | 'all'>('all');
  const [status, setStatus] = useState<QCStatusValue | null>(null);
  const [dateWindow, setDateWindow] = useState<DateWindow>('all');

  const params: QCListParams = {
    department: department === 'all' ? undefined : department,
    customerId: cp.customerId ?? undefined,
    productId: cp.productId ?? undefined,
    orderId: cp.orderId ?? undefined,
    status: status ?? undefined,
    search: search.trim() || undefined,
    dateFrom: dateFromFor(dateWindow),
    limit: 100,
  };
  const query = useQuery({
    queryKey: queryKeys.qc.reports({ admin: true, ...params }),
    queryFn: () => qcReportsApi.list(params),
  });

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <AppText variant="h1" style={{ marginBottom: spacing(1) }}>
        Quality Control
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Every defect report across the factory.
      </AppText>

      {/* Search (matches engineer, machine, mould, defect, description) */}
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
          placeholder="Engineer, machine, mould, defect…"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Company → Product → Order filters */}
      <View style={{ marginBottom: spacing(2) }}>
        <Select
          label="Company"
          value={cp.customerId}
          options={[{ label: 'All companies', value: '' }, ...cp.customerOptions]}
          onChange={(v) => (v ? cp.selectCustomer(v) : cp.selectCustomer(''))}
        />
        {cp.customerId ? (
          <Select
            label="Product"
            value={cp.productId}
            options={[{ label: 'All products', value: '' }, ...cp.productOptions]}
            onChange={(v) => (v ? cp.selectProduct(v) : cp.selectProduct(''))}
          />
        ) : null}
        {cp.productId ? (
          <Select
            label="Order ID"
            value={cp.orderId}
            options={[{ label: 'All orders', value: '' }, ...cp.orderOptions]}
            onChange={(v) => cp.setOrderId(v || null)}
          />
        ) : null}
      </View>

      {/* Department + Date + Status chips */}
      <ChipRow>
        {DEPARTMENTS.map((d) => (
          <Chip key={d.value} label={d.label} active={department === d.value} onPress={() => setDepartment(d.value)} />
        ))}
      </ChipRow>
      <ChipRow>
        <Chip label="All time" active={dateWindow === 'all'} onPress={() => setDateWindow('all')} />
        <Chip label="Last 7 days" active={dateWindow === '7'} onPress={() => setDateWindow('7')} />
        <Chip label="Last 30 days" active={dateWindow === '30'} onPress={() => setDateWindow('30')} />
      </ChipRow>
      <ChipRow>
        <Chip label="All status" active={status === null} onPress={() => setStatus(null)} />
        {STATUS_ORDER.map((s) => (
          <Chip key={s} label={STATUS_META[s].label} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </ChipRow>

      <View style={{ height: spacing(3) }} />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
        isEmpty={(d) => d.data.length === 0}
        emptyTitle="No reports found"
        emptyMessage="Adjust the filters above."
      >
        {(d) => (
          <View style={{ gap: spacing(3) }}>
            <AppText variant="caption" tone="muted">
              {d.pagination.total} report{d.pagination.total === 1 ? '' : 's'}
            </AppText>
            {d.data.map((r) => (
              <AdminReportCard
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

function ChipRow({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(2) }}>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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

function AdminReportCard({ report, onPress }: { report: QCReport; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const sev = SEVERITY_META[report.severity];
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
        <View style={{ width: 92, height: 92, backgroundColor: colors.surfaceAlt }}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <AppText style={{ fontSize: 26 }}>📝</AppText>
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
            {[report.customerName, report.productName, report.orderCode].filter(Boolean).join(' · ') || '—'}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {report.department === 'assembly' ? 'Assembly' : 'Moulding'} ·{' '}
            {[report.machine, report.mould].filter(Boolean).join(' · ') || 'no machine'}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {report.submittedByName ?? 'Engineer'} · {formatDateTime(report.createdAt)}
            {report.photos.length ? `  · 📸 ${report.photos.length}` : ''}
          </AppText>
        </View>
      </View>
    </PressableScale>
  );
}
