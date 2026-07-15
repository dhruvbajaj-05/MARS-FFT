import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { adminApi } from '@/api/endpoints/admin';
import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Card, Screen } from '@/components';
import { PressableScale, shadow } from '@/components/premium';
import { useTheme } from '@/theme/ThemeProvider';

const DEPT_LABELS: Record<string, string> = {
  moulding: 'Moulding',
  assembly: 'Assembly',
  qc: 'Quality',
  dispatch: 'Dispatch',
};

const DEPT_EMOJI: Record<string, string> = {
  moulding: '🏭',
  assembly: '🔧',
  qc: '✅',
  dispatch: '🚚',
};

function fmt(n: number) {
  return n.toLocaleString();
}

function rejectionColor(pct: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (pct === 0) return colors.status.success.fg;
  if (pct <= 5) return colors.status.progress.fg;
  return colors.status.danger.fg;
}

export function AdminDashboardScreen() {
  const { spacing, colors, radius } = useTheme();
  const navigation = useNavigation<any>();

  const dashboard = useQuery({ queryKey: queryKeys.admin.dashboard, queryFn: adminApi.dashboard });
  const depts = useQuery({ queryKey: queryKeys.admin.departments, queryFn: adminApi.departments });
  const delayed = useQuery({ queryKey: queryKeys.admin.delayed({}), queryFn: () => adminApi.delayedOrders({}) });
  const qcNotifs = useQuery({
    queryKey: queryKeys.qc.notifications({ unread: true }),
    queryFn: () => qcReportsApi.notifications({ unread: true, limit: 1 }),
  });
  const qcUnread = qcNotifs.data?.unreadCount ?? 0;

  const isRefreshing =
    dashboard.isRefetching || depts.isRefetching || delayed.isRefetching;

  function refetchAll() {
    dashboard.refetch();
    depts.refetch();
    delayed.refetch();
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const d = dashboard.data;
  const deptData = depts.data?.departments ?? [];
  const delayedCount = delayed.data?.pagination.total ?? 0;

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refetchAll} />}
    >
      {/* ── Header ── */}
      <View style={{ marginBottom: spacing(5) }}>
        <AppText variant="h1" style={{ letterSpacing: -0.5 }}>Command Center</AppText>
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing(1) }}>
          {dateStr}
        </AppText>
      </View>

      {/* ── Quality shortcut: monitor QC defect reports without opening the module ── */}
      <PressableScale onPress={() => navigation.navigate('AdminQC')}>
        <View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: qcUnread > 0 ? colors.status.danger.bg : colors.surface,
              borderRadius: radius.lg,
              padding: spacing(4),
              borderWidth: 1,
              borderColor: qcUnread > 0 ? colors.status.danger.fg : colors.border,
              gap: spacing(3),
              marginBottom: spacing(5),
            },
            shadow('sm'),
          ]}
        >
          <AppText style={{ fontSize: 26 }}>🔍</AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="h3" style={{ color: qcUnread > 0 ? colors.status.danger.fg : colors.text }}>
              Quality Control{qcUnread > 0 ? ` · ${qcUnread} new` : ''}
            </AppText>
            <AppText variant="caption" tone="muted">
              View every QC defect report across all companies
            </AppText>
          </View>
          <AppText style={{ fontSize: 22, color: colors.textMuted }}>›</AppText>
        </View>
      </PressableScale>

      {/* ── Delayed Orders Alert ── */}
      {delayedCount > 0 && (
        <Pressable
          onPress={() => navigation.navigate('AdminOrders')}
          style={{
            backgroundColor: colors.status.danger.bg,
            borderRadius: radius.md,
            padding: spacing(3),
            marginBottom: spacing(4),
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing(2),
          }}
        >
          <AppText style={{ fontSize: 18 }}>⚠️</AppText>
          <View style={{ flex: 1 }}>
            <AppText weight="600" style={{ color: colors.status.danger.fg }}>
              {delayedCount} order{delayedCount !== 1 ? 's' : ''} past SLA
            </AppText>
            <AppText variant="caption" style={{ color: colors.status.danger.fg }}>
              Tap to review delayed orders
            </AppText>
          </View>
          <AppText style={{ color: colors.status.danger.fg, fontSize: 18 }}>›</AppText>
        </Pressable>
      )}

      {/* ── Factory Live Status ── */}
      <AppText variant="h3" style={{ marginBottom: spacing(3) }}>Factory Live Status</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: spacing(4) }}
        contentContainerStyle={{ gap: spacing(3), paddingRight: spacing(4) }}
      >
        {deptData.length === 0
          ? ['moulding', 'assembly', 'qc', 'dispatch'].map((dept) => (
              <View
                key={dept}
                style={{
                  width: 148,
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  padding: spacing(4),
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: 0.5,
                }}
              >
                <AppText style={{ fontSize: 22 }}>{DEPT_EMOJI[dept]}</AppText>
                <AppText weight="600" style={{ marginTop: spacing(2) }}>
                  {DEPT_LABELS[dept]}
                </AppText>
                <AppText tone="muted" variant="caption">Loading…</AppText>
              </View>
            ))
          : deptData.map((dept) => {
              const label = DEPT_LABELS[dept.department] ?? dept.department;
              const emoji = DEPT_EMOJI[dept.department] ?? '🏭';
              const rejPct = (dept as any).rejectionPct ?? 0;
              const rejColor = rejectionColor(rejPct, colors);
              return (
                <Pressable
                  key={dept.department}
                  onPress={() => navigation.navigate('AdminFactory', { screen: 'FactoryMonitor', params: { dept: dept.department } })}
                  style={({ pressed }) => ({
                    width: 148,
                    backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                    borderRadius: radius.lg,
                    padding: spacing(4),
                    borderWidth: 1,
                    borderColor: colors.border,
                  })}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <AppText style={{ fontSize: 22 }}>{emoji}</AppText>
                    <AppText style={{ color: colors.textMuted, fontSize: 18 }}>›</AppText>
                  </View>
                  <AppText weight="700" style={{ marginTop: spacing(2), fontSize: 13 }}>
                    {label}
                  </AppText>
                  <AppText variant="h3" style={{ marginTop: spacing(1) }}>
                    {fmt(dept.throughput)}
                  </AppText>
                  <AppText variant="caption" tone="muted">good output</AppText>
                  {dept.hasRejections && (
                    <AppText
                      variant="caption"
                      weight="600"
                      style={{ marginTop: spacing(1), color: rejColor }}
                    >
                      {rejPct}% rejection
                    </AppText>
                  )}
                </Pressable>
              );
            })}
      </ScrollView>

      {/* ── Order Health ── */}
      <AppText variant="h3" style={{ marginBottom: spacing(3) }}>Order Health</AppText>
      <View style={{ flexDirection: 'row', gap: spacing(3), marginBottom: spacing(4) }}>
        {[
          { label: 'Total', value: d?.totalOrders ?? '—', color: colors.text },
          { label: 'Active', value: d?.activeOrders ?? '—', color: colors.status.info.fg },
          {
            label: 'Delayed',
            value: delayedCount,
            color: delayedCount > 0 ? colors.status.danger.fg : colors.status.success.fg,
          },
          { label: 'Done', value: d?.completedOrders ?? '—', color: colors.status.success.fg },
        ].map((item) => (
          <Pressable
            key={item.label}
            onPress={() => navigation.navigate('AdminOrders')}
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: spacing(3),
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <AppText variant="h2" style={{ color: item.color }}>
              {item.value}
            </AppText>
            <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      {/* ── Factory Stats ── */}
      <AppText variant="h3" style={{ marginBottom: spacing(3) }}>Factory Stats</AppText>
      <Card style={{ marginBottom: spacing(4) }}>
        {[
          { label: 'Customers', value: d?.totalCustomers ?? '—' },
          { label: 'Products', value: d?.totalProducts ?? '—' },
          { label: 'Total Orders', value: d?.totalOrders ?? '—' },
        ].map((item, i, arr) => (
          <View
            key={item.label}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing(2),
              borderBottomWidth: i < arr.length - 1 ? 1 : 0,
              borderBottomColor: colors.border,
            }}
          >
            <AppText tone="muted">{item.label}</AppText>
            <AppText weight="600">{item.value}</AppText>
          </View>
        ))}
      </Card>

      {/* ── Quick Links ── */}
      <AppText variant="h3" style={{ marginBottom: spacing(3) }}>Quick Actions</AppText>
      <View style={{ gap: spacing(3) }}>
        {[
          { label: 'View All Production Records', subtitle: 'Moulding, Assembly, QC, Dispatch', route: 'AdminFactory' },
          { label: 'Manage Orders', subtitle: 'Create, complete, archive orders', route: 'AdminOrders' },
          { label: 'Master Data', subtitle: 'Customers, Products, Machines, Users', route: 'AdminMaster' },
        ].map((item) => (
          <Pressable
            key={item.route}
            onPress={() => navigation.navigate(item.route)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
              borderRadius: radius.md,
              padding: spacing(4),
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            })}
          >
            <View style={{ flex: 1 }}>
              <AppText weight="600">{item.label}</AppText>
              <AppText variant="caption" tone="muted">{item.subtitle}</AppText>
            </View>
            <AppText style={{ color: colors.primary, fontSize: 22 }}>›</AppText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
