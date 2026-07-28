import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  UIManager,
  View,
} from 'react-native';

import { customerApi } from '@/api/endpoints/customer';
import { queryKeys } from '@/api/queryKeys';
import type {
  CustomerAssemblyLine,
  CustomerDefectReport,
  CustomerMoldRow,
  CustomerOrderDashboard,
  Media,
} from '@/api/types';
import {
  AppText,
  ErrorState,
  GaugeBar,
  MetricRow,
  PremiumEmpty,
  ProgressBadge,
  PressableScale,
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
import { SEVERITY_META } from '@/components/qc';
import type { CustomerStackParamList } from '@/navigation/CustomerHomeNavigator';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveMediaUrl } from '@/utils/mediaUrl';
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
            {o.poNumber ?? o.product ?? 'Order'}
          </AppText>
          <AppText variant="h2" style={{ marginTop: 2 }}>{o.itemCode ?? o.orderCode}</AppText>
          {o.product ? (
            <AppText variant="caption" tone="muted">{o.product}</AppText>
          ) : null}
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

// ---- Department tab bar -----------------------------------------------------
type DeptKey = 'moulding' | 'assembly' | 'qc' | 'dispatch' | 'timeline';
const TABS: { key: DeptKey; label: string; icon: string }[] = [
  { key: 'moulding', label: 'Moulding', icon: '🧱' },
  { key: 'assembly', label: 'Assembly', icon: '🔧' },
  { key: 'qc', label: 'Quality', icon: '🔍' },
  { key: 'dispatch', label: 'Dispatch', icon: '🚚' },
  { key: 'timeline', label: 'Timeline', icon: '🗺️' },
];

function DeptTabBar({ tab, onChange }: { tab: DeptKey; onChange: (t: DeptKey) => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing(2) }}
      style={{ marginBottom: spacing(4) }}
    >
      {TABS.map((t) => {
        const selected = tab === t.key;
        return (
          <PressableScale key={t.key} onPress={() => onChange(t.key)}>
            <View
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing(1),
                  paddingHorizontal: spacing(4),
                  paddingVertical: spacing(2.5),
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
                selected ? shadow('sm') : null,
              ]}
            >
              <AppText style={{ fontSize: 14 }}>{t.icon}</AppText>
              <AppText weight="700" style={{ color: selected ? colors.primaryText : colors.textMuted }}>
                {t.label}
              </AppText>
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
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

// ---- Expandable assembly-line card (parallel to MoldCard) -------------------
function AssemblyLineCard({ line }: { line: CustomerAssemblyLine }) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const clean = line.rejected === 0;
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <AppText weight="700" style={{ fontSize: 15 }}>{line.lineName}</AppText>
            <AppText variant="caption" tone="muted">
              {line.runs} run{line.runs === 1 ? '' : 's'}
              {line.shift ? ` · Shift ${line.shift}` : ''}
            </AppText>
          </View>
          <StatusPill
            label={clean ? `${line.goodAssemblies} good` : `${line.rejectionRate}% rej`}
            tone={clean ? 'success' : 'progress'}
          />
          <AppText style={{ color: colors.textMuted, marginLeft: spacing(2), fontSize: 16 }}>{open ? '▾' : '▸'}</AppText>
        </View>
      </Pressable>

      {open ? (
        <View style={{ paddingHorizontal: spacing(3), paddingBottom: spacing(3) }}>
          <View style={{ height: 0.5, backgroundColor: colors.border, marginBottom: spacing(1) }} />
          <MetricRow label="Good Assemblies" value={line.goodAssemblies} tone="success" />
          <MetricRow label="Rejected" value={line.rejected} tone={line.rejected > 0 ? 'danger' : undefined} />
          <MetricRow label="Rejection %" value={`${line.rejectionRate}%`} tone={line.rejectionRate > 5 ? 'danger' : undefined} />
          <MetricRow label="Operators" value={line.operators} />
          {line.shift ? <MetricRow label="Last Shift" value={`Shift ${line.shift}`} /> : null}
          <MetricRow label="Records" value={line.runs} />
          {line.lastUpdatedAt ? <MetricRow label="Last Activity" value={relativeTime(line.lastUpdatedAt)} /> : null}
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
            <Image source={{ uri: active.url }} style={{ width: '100%', height: '78%' }} contentFit="contain" transition={200} />
          ) : null}
          {active ? (
            <Pressable
              onPress={() => {
                const url = resolveMediaUrl(active.url);
                if (url) Linking.openURL(url);
              }}
              style={{
                marginTop: spacing(4),
                backgroundColor: 'rgba(255,255,255,0.16)',
                borderRadius: radius.pill,
                paddingHorizontal: spacing(5),
                paddingVertical: spacing(2),
              }}
            >
              <AppText style={{ color: '#fff' }} weight="700">⬇  Download</AppText>
            </Pressable>
          ) : null}
          <AppText style={{ color: '#fff', marginTop: spacing(3) }}>Tap anywhere to close</AppText>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---- Engineer defect report card (image-first QC report) --------------------
function DefectReportCard({ report: r }: { report: CustomerDefectReport }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      style={{
        borderWidth: 0.5,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing(3),
        marginBottom: spacing(2),
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: spacing(2), alignItems: 'center' }}>
          <StatusPill label={r.status === 'closed' ? 'Closed' : 'Open'} tone={r.status === 'closed' ? 'success' : 'danger'} />
          <StatusPill label={SEVERITY_META[r.severity].label} tone={SEVERITY_META[r.severity].tone} />
        </View>
        <AppText variant="caption" tone="muted">{formatDate(r.createdAt)}</AppText>
      </View>
      <AppText weight="700" style={{ marginTop: spacing(2) }}>
        {r.defects.length ? r.defects.join(', ') : 'Defect report'}
      </AppText>
      {r.description ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {r.description}
        </AppText>
      ) : null}
      <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {r.department === 'assembly' ? 'Assembly' : 'Moulding'}
        {[r.machine, r.mould, r.part].filter(Boolean).length
          ? ` · ${[r.machine, r.mould, r.part].filter(Boolean).join(' · ')}`
          : ''}
        {r.shift ? ` · Shift ${r.shift}` : ''}
      </AppText>
      <PhotoStrip photos={r.photos} />

      {/* Comments — read-only thread (the customer portal is view-only). */}
      {r.comments.length > 0 ? (
        <View style={{ marginTop: spacing(3), borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: spacing(3) }}>
          <AppText variant="caption" weight="700" tone="muted" style={{ marginBottom: spacing(2) }}>
            Comments ({r.comments.length})
          </AppText>
          {r.comments.map((c, i) => (
            <View key={c.id ?? i} style={{ marginBottom: spacing(2) }}>
              <AppText variant="caption" weight="700">
                {c.authorName || 'User'}
                {c.authorRole ? (
                  <AppText variant="caption" tone="muted">  · {c.authorRole.replace(/_/g, ' ')}</AppText>
                ) : null}
              </AppText>
              <AppText variant="caption">{c.text}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---- A "Done QC" checkpoint row (Moulding / Assembly sign-off) ---------------
function QcCheckpoint({ label, done }: { label: string; done: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(2),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
        <AppText style={{ fontSize: 16, color: done ? colors.status.success.fg : colors.textMuted }}>
          {done ? '✓' : '○'}
        </AppText>
        <AppText weight="600">{label}</AppText>
      </View>
      <StatusPill label={done ? 'Done' : 'Pending'} tone={done ? 'success' : 'neutral'} />
    </View>
  );
}

// ---- Loading skeleton -------------------------------------------------------
function DashboardSkeleton() {
  const { spacing } = useTheme();
  return (
    <View>
      <Skeleton height={150} radius={16} style={{ marginBottom: spacing(4) }} />
      <Skeleton height={48} radius={24} style={{ marginBottom: spacing(4) }} />
      <Skeleton height={200} radius={16} style={{ marginBottom: spacing(4) }} />
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

// ---- Per-department tab panels ---------------------------------------------
function MouldingTab({ d }: { d: CustomerOrderDashboard }) {
  const { spacing } = useTheme();
  const m = d.moulding;
  return (
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
      ) : (
        <AppText tone="muted" variant="caption" style={{ marginTop: spacing(3) }}>
          No moulding records yet.
        </AppText>
      )}
    </SectionCard>
  );
}

function AssemblyTab({ d }: { d: CustomerOrderDashboard }) {
  const { spacing } = useTheme();
  const a = d.assembly;
  return (
    <SectionCard
      icon="🔧"
      title="Assembly"
      statusLabel={a.status}
      statusTone={statusTone(a.status)}
      progressPct={a.progressPct}
    >
      <StatGrid>
        <StatTile label="Required" value={a.requiredQuantity} />
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

      {a.lines.length > 0 ? (
        <View style={{ marginTop: spacing(4) }}>
          <AppText weight="700" style={{ marginBottom: spacing(2) }}>By assembly line</AppText>
          {a.lines.map((line) => (
            <AssemblyLineCard key={line.lineName} line={line} />
          ))}
        </View>
      ) : (
        <AppText tone="muted" variant="caption" style={{ marginTop: spacing(3) }}>
          No assembly records yet.
        </AppText>
      )}
    </SectionCard>
  );
}

function QcTab({ d }: { d: CustomerOrderDashboard }) {
  const { colors, spacing } = useTheme();
  const q = d.qc;
  const reports = d.defectReports;
  return (
    <SectionCard
      icon="🔍"
      title="Quality Control"
      statusLabel={q.status}
      statusTone={statusTone(q.status)}
      progressPct={q.progressPct}
    >
      <AppText variant="caption" tone="muted">
        QC completes in two sign-offs — Moulding QC and Assembly QC (50% each).
      </AppText>

      <View style={{ marginTop: spacing(3) }}>
        <QcCheckpoint label="Moulding QC" done={q.mouldingQcDone} />
        <View style={{ height: 0.5, backgroundColor: colors.border }} />
        <QcCheckpoint label="Assembly QC" done={q.assemblyQcDone} />
      </View>

      {/* Reports for this item code */}
      <View style={{ marginTop: spacing(4) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) }}>
          <AppText weight="700">Reports ({q.reportCount})</AppText>
          {q.openReports > 0 ? (
            <StatusPill label={`${q.openReports} open`} tone="danger" />
          ) : null}
        </View>
        {reports.length === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AppText style={{ color: colors.status.success.fg, marginRight: spacing(2) }}>✓</AppText>
            <AppText tone="muted">No defect reports filed for this item code.</AppText>
          </View>
        ) : (
          reports.map((r) => <DefectReportCard key={r.id} report={r} />)
        )}
      </View>
    </SectionCard>
  );
}

function DispatchTab({ d }: { d: CustomerOrderDashboard }) {
  const { colors, spacing } = useTheme();
  const dis = d.dispatch;
  return (
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
      ) : (
        <AppText tone="muted" variant="caption" style={{ marginTop: spacing(3) }}>
          Nothing dispatched yet.
        </AppText>
      )}
    </SectionCard>
  );
}

function TimelineTab({ d }: { d: CustomerOrderDashboard }) {
  return (
    <SectionCard icon="🗺️" title="Production Timeline">
      <TimelineBlock steps={d.timeline} />
    </SectionCard>
  );
}

function OrderDashboard({ d }: { d: CustomerOrderDashboard }) {
  const [tab, setTab] = useState<DeptKey>('moulding');

  return (
    <View>
      <OrderHero d={d} />
      <DeptTabBar tab={tab} onChange={setTab} />

      {tab === 'moulding' ? <MouldingTab d={d} /> : null}
      {tab === 'assembly' ? <AssemblyTab d={d} /> : null}
      {tab === 'qc' ? <QcTab d={d} /> : null}
      {tab === 'dispatch' ? <DispatchTab d={d} /> : null}
      {tab === 'timeline' ? <TimelineTab d={d} /> : null}
    </View>
  );
}
