import { useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { adminApi, type AdminRecordParams } from '@/api/endpoints/admin';
import { queryKeys } from '@/api/queryKeys';
import type {
  AdminAssemblyRecord,
  AdminDispatchRecord,
  AdminMouldingRecord,
  AdminQCRecord,
} from '@/api/types';
import { AppText, Card, Screen } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

type Dept = 'moulding' | 'assembly' | 'qc' | 'dispatch';

const TABS: { key: Dept; label: string }[] = [
  { key: 'moulding', label: 'Moulding' },
  { key: 'assembly', label: 'Assembly' },
  { key: 'qc', label: 'QC' },
  { key: 'dispatch', label: 'Dispatch' },
];

function fmt(n: number) {
  return n.toLocaleString();
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function MouldingCard({ r }: { r: AdminMouldingRecord }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Card style={{ marginBottom: spacing(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
        <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
          {r.customer ?? '—'}
        </AppText>
        <AppText variant="caption" style={{ color: colors.primary, marginLeft: spacing(2) }}>
          {r.orderCode ?? '—'}
        </AppText>
      </View>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
        {r.product ?? '—'}  ·  {r.partName}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(2) }}>
        {[
          { label: 'Mould', value: r.moldName },
          { label: 'Machine', value: r.machineNumber },
          { label: 'Shift', value: `Shift ${r.shift}` },
          { label: 'Cavity', value: String(r.cavity) },
        ].map((chip) => (
          <View
            key={chip.label}
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: spacing(2),
              paddingVertical: spacing(1),
            }}
          >
            <AppText variant="caption" tone="muted">{chip.label} </AppText>
            <AppText variant="caption" weight="600">{chip.value}</AppText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <AppText variant="caption" tone="muted">Shots Done</AppText>
          <AppText weight="700">{fmt(r.shotsDone)}</AppText>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AppText variant="caption" tone="muted">Rejected Shots</AppText>
          <AppText weight="700" style={{ color: r.rejectedShots > 0 ? colors.status.danger.fg : colors.status.success.fg }}>
            {fmt(r.rejectedShots)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" tone="muted">Good Parts</AppText>
          <AppText weight="700" style={{ color: colors.status.success.fg }}>
            {fmt(r.goodParts)}
          </AppText>
        </View>
      </View>

      {r.rejectionReasons.length > 0 && (
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
          Defects: {r.rejectionReasons.join(', ')}
        </AppText>
      )}

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
        {shortDate(r.createdAt)}
      </AppText>
    </Card>
  );
}

function AssemblyCard({ r }: { r: AdminAssemblyRecord }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Card style={{ marginBottom: spacing(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
        <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
          {r.customer ?? '—'}
        </AppText>
        <AppText variant="caption" style={{ color: colors.primary, marginLeft: spacing(2) }}>
          {r.orderCode ?? '—'}
        </AppText>
      </View>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
        {r.product ?? '—'}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(2) }}>
        {[
          { label: 'Line', value: r.assemblyLine },
          { label: 'Shift', value: `Shift ${r.shift}` },
          { label: 'Operators', value: String(r.operatorCount) },
        ].map((chip) => (
          <View
            key={chip.label}
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: spacing(2),
              paddingVertical: spacing(1),
            }}
          >
            <AppText variant="caption" tone="muted">{chip.label} </AppText>
            <AppText variant="caption" weight="600">{chip.value}</AppText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <AppText variant="caption" tone="muted">Input</AppText>
          <AppText weight="700">{fmt(r.inputQuantity)}</AppText>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AppText variant="caption" tone="muted">Assembled</AppText>
          <AppText weight="700" style={{ color: colors.status.success.fg }}>
            {fmt(r.assembledQuantity)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" tone="muted">Rejected</AppText>
          <AppText weight="700" style={{ color: r.rejectedQuantity > 0 ? colors.status.danger.fg : colors.text }}>
            {fmt(r.rejectedQuantity)}
          </AppText>
        </View>
      </View>

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
        {shortDate(r.createdAt)}
      </AppText>
    </Card>
  );
}

function QCCard({ r }: { r: AdminQCRecord }) {
  const { colors, spacing, radius } = useTheme();
  const approvalPct =
    r.sampleSize > 0 ? Math.round((r.acceptedQuantity / r.sampleSize) * 100) : 0;
  return (
    <Card style={{ marginBottom: spacing(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
        <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
          {r.customer ?? '—'}
        </AppText>
        <AppText variant="caption" style={{ color: colors.primary, marginLeft: spacing(2) }}>
          {r.orderCode ?? '—'}
        </AppText>
      </View>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
        {r.product ?? '—'}  ·  {r.inspectionType}
      </AppText>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(2) }}>
        <View>
          <AppText variant="caption" tone="muted">Sample</AppText>
          <AppText weight="700">{fmt(r.sampleSize)}</AppText>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AppText variant="caption" tone="muted">Accepted</AppText>
          <AppText weight="700" style={{ color: colors.status.success.fg }}>
            {fmt(r.acceptedQuantity)}
          </AppText>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AppText variant="caption" tone="muted">Rejected</AppText>
          <AppText weight="700" style={{ color: r.rejectedQuantity > 0 ? colors.status.danger.fg : colors.text }}>
            {fmt(r.rejectedQuantity)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" tone="muted">Pass Rate</AppText>
          <AppText
            weight="700"
            style={{ color: approvalPct >= 95 ? colors.status.success.fg : colors.status.danger.fg }}
          >
            {approvalPct}%
          </AppText>
        </View>
      </View>

      {r.defects.length > 0 && (
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing(2) }}>
          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>Defects</AppText>
          {r.defects.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="caption">{d.defectType}</AppText>
              <AppText variant="caption" weight="600">{d.quantity}</AppText>
            </View>
          ))}
        </View>
      )}

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
        {shortDate(r.inspectionDate)}
      </AppText>
    </Card>
  );
}

function DispatchCard({ r }: { r: AdminDispatchRecord }) {
  const { colors, spacing } = useTheme();
  return (
    <Card style={{ marginBottom: spacing(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
        <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
          {r.customer ?? '—'}
        </AppText>
        <AppText variant="caption" style={{ color: colors.primary, marginLeft: spacing(2) }}>
          {r.orderCode ?? '—'}
        </AppText>
      </View>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
        {r.product ?? '—'}
      </AppText>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(2) }}>
        <View>
          <AppText variant="caption" tone="muted">Packed</AppText>
          <AppText weight="700" style={{ color: colors.status.success.fg }}>
            {fmt(r.packedQuantity)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" tone="muted">Cartons</AppText>
          <AppText weight="700">{r.cartonCount}</AppText>
        </View>
      </View>

      <View style={{ gap: spacing(1) }}>
        <AppText variant="caption" tone="muted">
          Transporter: <AppText variant="caption" weight="600">{r.transporterName}</AppText>
        </AppText>
        <AppText variant="caption" tone="muted">
          Vehicle: <AppText variant="caption" weight="600">{r.vehicleNumber}</AppText>
        </AppText>
        <AppText variant="caption" tone="muted">
          LR: <AppText variant="caption" weight="600">{r.lrNumber}</AppText>
          {'   '}Invoice: <AppText variant="caption" weight="600">{r.invoiceNumber}</AppText>
        </AppText>
      </View>

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
        Dispatched: {shortDate(r.dispatchDate)}
      </AppText>
    </Card>
  );
}

export function FactoryMonitorScreen() {
  const { spacing, colors, radius } = useTheme();
  const route = useRoute<any>();
  const initialDept: Dept = route.params?.dept ?? 'moulding';
  const [activeTab, setActiveTab] = useState<Dept>(initialDept);
  const [page, setPage] = useState(1);

  const params: AdminRecordParams = useMemo(() => ({ page, limit: 30 }), [page]);

  const mouldingQ = useQuery({
    queryKey: queryKeys.admin.records.moulding(params),
    queryFn: () => adminApi.mouldingRecords(params),
    enabled: activeTab === 'moulding',
  });
  const assemblyQ = useQuery({
    queryKey: queryKeys.admin.records.assembly(params),
    queryFn: () => adminApi.assemblyRecords(params),
    enabled: activeTab === 'assembly',
  });
  const qcQ = useQuery({
    queryKey: queryKeys.admin.records.qc(params),
    queryFn: () => adminApi.qcRecords(params),
    enabled: activeTab === 'qc',
  });
  const dispatchQ = useQuery({
    queryKey: queryKeys.admin.records.dispatch(params),
    queryFn: () => adminApi.dispatchRecords(params),
    enabled: activeTab === 'dispatch',
  });

  const activeQuery =
    activeTab === 'moulding'
      ? mouldingQ
      : activeTab === 'assembly'
        ? assemblyQ
        : activeTab === 'qc'
          ? qcQ
          : dispatchQ;

  function switchTab(tab: Dept) {
    setActiveTab(tab);
    setPage(1);
  }

  const totalPages = activeQuery.data?.pagination.pages ?? 1;
  const totalCount = activeQuery.data?.pagination.total ?? 0;

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={activeQuery.isRefetching} onRefresh={activeQuery.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Production Records
      </AppText>

      {/* Department Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: spacing(4) }}
        contentContainerStyle={{ gap: spacing(2) }}
      >
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => switchTab(tab.key)}
              style={{
                paddingHorizontal: spacing(4),
                paddingVertical: spacing(2),
                borderRadius: radius.pill,
                backgroundColor: active ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
              }}
            >
              <AppText
                weight="600"
                style={{ color: active ? colors.primaryText : colors.text, fontSize: 14 }}
              >
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Record count */}
      {!activeQuery.isLoading && (
        <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(3) }}>
          {totalCount} record{totalCount !== 1 ? 's' : ''}
        </AppText>
      )}

      {/* Loading state */}
      {activeQuery.isLoading && (
        <AppText tone="muted" style={{ textAlign: 'center', marginTop: spacing(8) }}>
          Loading records…
        </AppText>
      )}

      {/* Error state */}
      {activeQuery.isError && (
        <AppText style={{ color: colors.status.danger.fg, textAlign: 'center', marginTop: spacing(8) }}>
          Failed to load records.
        </AppText>
      )}

      {/* Records */}
      {activeTab === 'moulding' &&
        (mouldingQ.data?.data ?? []).map((r) => <MouldingCard key={r.id} r={r} />)}
      {activeTab === 'assembly' &&
        (assemblyQ.data?.data ?? []).map((r) => <AssemblyCard key={r.id} r={r} />)}
      {activeTab === 'qc' &&
        (qcQ.data?.data ?? []).map((r) => <QCCard key={r.id} r={r} />)}
      {activeTab === 'dispatch' &&
        (dispatchQ.data?.data ?? []).map((r) => <DispatchCard key={r.id} r={r} />)}

      {!activeQuery.isLoading && totalCount === 0 && !activeQuery.isError && (
        <View style={{ alignItems: 'center', marginTop: spacing(8) }}>
          <AppText style={{ fontSize: 36 }}>📭</AppText>
          <AppText tone="muted" style={{ marginTop: spacing(2) }}>No records yet</AppText>
        </View>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing(3), marginTop: spacing(4) }}>
          <Pressable
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              paddingHorizontal: spacing(4),
              paddingVertical: spacing(2),
              borderRadius: radius.md,
              backgroundColor: page === 1 ? colors.surfaceAlt : colors.primary,
            }}
          >
            <AppText style={{ color: page === 1 ? colors.textMuted : colors.primaryText }}>
              ‹ Prev
            </AppText>
          </Pressable>
          <View style={{ justifyContent: 'center' }}>
            <AppText tone="muted">
              {page} / {totalPages}
            </AppText>
          </View>
          <Pressable
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              paddingHorizontal: spacing(4),
              paddingVertical: spacing(2),
              borderRadius: radius.md,
              backgroundColor: page === totalPages ? colors.surfaceAlt : colors.primary,
            }}
          >
            <AppText style={{ color: page === totalPages ? colors.textMuted : colors.primaryText }}>
              Next ›
            </AppText>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}
