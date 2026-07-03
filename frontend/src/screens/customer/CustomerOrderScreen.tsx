import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { LayoutAnimation, Modal, Platform, Pressable, RefreshControl, ScrollView, UIManager, View } from 'react-native';

import { customerApi } from '@/api/endpoints/customer';
import { queryKeys } from '@/api/queryKeys';
import type { CustomerMoldRow, CustomerOrderDashboard, Media } from '@/api/types';
import {
  AppText,
  ErrorState,
  GaugeBar,
  MetricRow,
  PremiumEmpty,
  ProgressBadge,
  Screen,
  SectionCard,
  Skeleton,
  StatGrid,
  StatTile,
  StatusPill,
  Timeline as TimelineBlock,
  shadow,
  statusTone,
} from '@/components';
import type { CustomerStackParamList } from '@/navigation/CustomerHomeNavigator';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDate, relativeTime } from '@/utils/format';

type Rt = RouteProp<CustomerStackParamList, 'CustomerOrder'>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---- Order hero -------------------------------------------------------------
function OrderHero({ d }: { d: CustomerOrderDashboard }) {
  const { colors, radius, spacing } = useTheme();
  const o = d.order;
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing(5),
          marginBottom: spacing(4),
          borderWidth: 0.5,
          borderColor: colors.border,
        },
        shadow('md'),
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ProgressBadge pct={o.overallProgressPct} size={78} tone={statusTone(o.status)} />
        <View style={{ flex: 1, marginLeft: spacing(4) }}>
          <AppText variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {o.product ?? 'Order'}
          </AppText>
          <AppText variant="h2" style={{ marginTop: 2 }}>{o.orderCode}</AppText>
          <View style={{ marginTop: spacing(2) }}>
            <StatusPill label={o.status} tone={statusTone(o.status)} />
          </View>
        </View>
      </View>
      <View style={{ marginTop: spacing(4) }}>
        <StatGrid>
          <StatTile label="Order Quantity" value={o.orderQuantity} />
          <StatTile label="Dispatched" value={d.dispatch.dispatchedQuantity} tone="success" />
          <StatTile label="Remaining" value={d.dispatch.remainingQuantity} tone="progress" />
        </StatGrid>
      </View>
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(3) }}>
        Placed {formatDate(o.createdAt)}
      </AppText>
    </View>
  );
}

// ---- Expandable mould card --------------------------------------------------
function MoldCard({ mold }: { mold: CustomerMoldRow }) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const done = mold.progressPct >= 100;
  return (
    <View
      style={{
        borderWidth: 0.5,
        borderColor: colors.border,
        borderRadius: radius.md,
        marginBottom: spacing(2),
        overflow: 'hidden',
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((v) => !v);
        }}
        style={{ padding: spacing(3) }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <AppText weight="700" style={{ fontSize: 15 }}>{mold.moldName}</AppText>
            {mold.partName ? <AppText variant="caption" tone="muted">{mold.partName}</AppText> : null}
          </View>
          <StatusPill label={done ? 'Completed' : 'In progress'} tone={done ? 'success' : 'progress'} />
          <AppText style={{ color: colors.textMuted, marginLeft: spacing(2), fontSize: 16 }}>{open ? '▾' : '▸'}</AppText>
        </View>
        <GaugeBar pct={mold.progressPct} tone={done ? 'success' : 'progress'} />
      </Pressable>

      {open ? (
        <View style={{ paddingHorizontal: spacing(3), paddingBottom: spacing(3) }}>
          <View style={{ height: 0.5, backgroundColor: colors.border, marginBottom: spacing(1) }} />
          <MetricRow label="Required" value={mold.required} />
          <MetricRow label="Produced" value={mold.produced} />
          <MetricRow label="Good Parts" value={mold.goodParts} tone="success" />
          <MetricRow label="Pending" value={mold.pending} tone={mold.pending > 0 ? 'progress' : undefined} />
          <MetricRow label="Surplus" value={mold.surplus} tone={mold.surplus > 0 ? 'info' : undefined} />
          <MetricRow label="Rejected Parts" value={mold.rejectedParts} tone={mold.rejectedParts > 0 ? 'danger' : undefined} />
          <MetricRow label="Rejection %" value={`${mold.rejectionRate}%`} tone={mold.rejectionRate > 5 ? 'danger' : undefined} />
          {mold.machine ? <MetricRow label="Machine" value={mold.machine} /> : null}
          {mold.lastShift ? <MetricRow label="Last Shift" value={`Shift ${mold.lastShift}`} /> : null}
        </View>
      ) : null}
    </View>
  );
}

// ---- Photo strip with full-screen viewer -----------------------------------
function PhotoStrip({ photos }: { photos: Media[] }) {
  const { colors, radius, spacing } = useTheme();
  const [active, setActive] = useState<Media | null>(null);
  if (photos.length === 0) return null;
  return (
    <View style={{ marginTop: spacing(3) }}>
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
        Inspection photos ({photos.length})
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {photos.map((p) => (
          <Pressable key={p.id} onPress={() => setActive(p)} style={{ marginRight: spacing(2) }}>
            <Image
              source={{ uri: p.url }}
              style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <Pressable
          onPress={() => setActive(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: spacing(4) }}
        >
          {active ? (
            <Image source={{ uri: active.url }} style={{ width: '100%', height: '80%' }} contentFit="contain" transition={200} />
          ) : null}
          <AppText style={{ color: '#fff', marginTop: spacing(4) }}>Tap anywhere to close</AppText>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---- Loading skeleton -------------------------------------------------------
function DashboardSkeleton() {
  const { spacing } = useTheme();
  return (
    <View>
      <Skeleton height={150} radius={16} style={{ marginBottom: spacing(4) }} />
      <Skeleton height={200} radius={16} style={{ marginBottom: spacing(4) }} />
      <Skeleton height={140} radius={16} style={{ marginBottom: spacing(4) }} />
      <Skeleton height={160} radius={16} />
    </View>
  );
}

export function CustomerOrderScreen() {
  const { params } = useRoute<Rt>();
  const query = useQuery({
    queryKey: queryKeys.customer.orderDashboard(params.orderId),
    queryFn: () => customerApi.orderDashboard(params.orderId),
  });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      {query.isLoading ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <ErrorState message="We couldn't load this order." onRetry={query.refetch} />
      ) : !query.data ? (
        <PremiumEmpty title="Nothing to show yet" />
      ) : (
        <OrderDashboard d={query.data} />
      )}
    </Screen>
  );
}

function OrderDashboard({ d }: { d: CustomerOrderDashboard }) {
  const { colors, spacing } = useTheme();
  const m = d.moulding;
  const a = d.assembly;
  const q = d.qc;
  const dis = d.dispatch;

  return (
    <View>
      <OrderHero d={d} />

      {/* MOULDING */}
      <SectionCard
        icon="🧱"
        title="Moulding"
        statusLabel={m.status}
        statusTone={statusTone(m.status)}
        progressPct={m.progressPct}
      >
        <StatGrid>
          <StatTile label="Required" value={m.requiredQuantity} />
          <StatTile label="Produced" value={m.producedQuantity} />
          <StatTile label="Remaining" value={m.remainingQuantity} tone="progress" />
          <StatTile label="Good Parts" value={m.goodParts} tone="success" emphasize />
          <StatTile label="Surplus" value={m.surplus} tone="info" />
          <StatTile label="Rejected" value={m.rejectedParts} tone={m.rejectedParts > 0 ? 'danger' : undefined} />
        </StatGrid>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(3) }}>
          <AppText variant="caption" tone="muted">Rejection rate {m.rejectionRate}%</AppText>
          <AppText variant="caption" tone="muted">{relativeTime(m.lastUpdatedAt)}</AppText>
        </View>

        {m.molds.length > 0 ? (
          <View style={{ marginTop: spacing(4) }}>
            <AppText weight="700" style={{ marginBottom: spacing(2) }}>By mould</AppText>
            {m.molds.map((mold) => (
              <MoldCard key={mold.moldName} mold={mold} />
            ))}
          </View>
        ) : null}
      </SectionCard>

      {/* ASSEMBLY */}
      <SectionCard
        icon="🔧"
        title="Assembly"
        statusLabel={a.status}
        statusTone={statusTone(a.status)}
        progressPct={a.progressPct}
      >
        <StatGrid>
          <StatTile label="Good Assemblies" value={a.goodAssemblies} tone="success" emphasize />
          <StatTile label="Pending" value={a.pending} tone="progress" />
          <StatTile label="Rejected" value={a.rejected} tone={a.rejected > 0 ? 'danger' : undefined} />
        </StatGrid>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(3) }}>
          <AppText variant="caption" tone="muted">
            Rejection rate {a.rejectionRate}%{a.operators > 0 ? ` · ${a.operators} operators` : ''}
          </AppText>
          <AppText variant="caption" tone="muted">{relativeTime(a.lastUpdatedAt)}</AppText>
        </View>
      </SectionCard>

      {/* QUALITY CONTROL */}
      <SectionCard
        icon="🔍"
        title="Quality Control"
        statusLabel={q.status}
        statusTone={statusTone(q.status)}
        progressPct={q.progressPct}
      >
        <StatGrid>
          <StatTile label="Passed" value={q.passed} tone="success" emphasize />
          <StatTile label="Failed" value={q.failed} tone={q.failed > 0 ? 'danger' : undefined} />
          <StatTile label="Pending" value={q.pendingInspection} tone="progress" />
        </StatGrid>
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing(3) }}>
          Pass rate {q.passRate}% · {q.inspected.toLocaleString()} inspected
        </AppText>

        {/* Defect breakdown */}
        <View style={{ marginTop: spacing(4) }}>
          <AppText weight="700" style={{ marginBottom: spacing(2) }}>Defects</AppText>
          {q.defects.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <AppText style={{ color: colors.status.success.fg, marginRight: spacing(2) }}>✓</AppText>
              <AppText tone="muted">No defects recorded.</AppText>
            </View>
          ) : (
            q.defects.map((def) => {
              const total = q.defects.reduce((s, x) => s + x.quantity, 0) || 1;
              return (
                <View key={def.type} style={{ marginBottom: spacing(2) }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <AppText variant="caption" weight="600">{def.type}</AppText>
                    <AppText variant="caption" weight="700" style={{ color: colors.status.danger.fg }}>{def.quantity}</AppText>
                  </View>
                  <GaugeBar pct={(def.quantity / total) * 100} tone="danger" height={6} />
                </View>
              );
            })
          )}
        </View>

        <PhotoStrip photos={q.photos} />
      </SectionCard>

      {/* DISPATCH */}
      <SectionCard
        icon="🚚"
        title="Dispatch"
        statusLabel={dis.status}
        statusTone={statusTone(dis.status)}
        progressPct={dis.progressPct}
      >
        <StatGrid>
          <StatTile label="Dispatched" value={dis.dispatchedQuantity} tone="success" emphasize />
          <StatTile label="Remaining" value={dis.remainingQuantity} tone="progress" />
          <StatTile label="Cartons" value={dis.cartonCount} />
        </StatGrid>
        {dis.lastDispatchDate ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(3) }}>
            Last dispatch {formatDate(dis.lastDispatchDate)}
          </AppText>
        ) : null}

        {dis.shipments.length > 0 ? (
          <View style={{ marginTop: spacing(4) }}>
            <AppText weight="700" style={{ marginBottom: spacing(2) }}>Shipments</AppText>
            {dis.shipments.map((s, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: colors.surfaceAlt,
                  borderRadius: 10,
                  padding: spacing(3),
                  marginBottom: spacing(2),
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText weight="600">{s.quantity.toLocaleString()} units · {s.cartonCount} cartons</AppText>
                  <AppText variant="caption" tone="muted">{formatDate(s.dispatchDate)}</AppText>
                </View>
                {s.transporter ? (
                  <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    {s.transporter}{s.vehicleNumber ? ` · ${s.vehicleNumber}` : ''}
                  </AppText>
                ) : null}
                {s.lrNumber || s.invoiceNumber ? (
                  <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    {s.lrNumber ? `LR ${s.lrNumber}` : ''}{s.lrNumber && s.invoiceNumber ? '  ·  ' : ''}{s.invoiceNumber ? `Invoice ${s.invoiceNumber}` : ''}
                  </AppText>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </SectionCard>

      {/* TIMELINE */}
      <SectionCard icon="🗺️" title="Production Timeline">
        <TimelineBlock steps={d.timeline} />
      </SectionCard>
    </View>
  );
}
