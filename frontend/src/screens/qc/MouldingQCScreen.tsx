import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCActiveOrder, QCReport } from '@/api/types';
import { AppText, Button, Card, PressableScale, Screen, StatusPill, shadow } from '@/components';
import { SEVERITY_META, formatDateTime } from '@/components/qc';
import { useMouldingSession } from '@/features/moulding/MouldingSessionContext';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import type { QCStackParamList } from './navTypes';

type Nav = NativeStackNavigationProp<QCStackParamList, 'MouldingQC'>;
type Mode = 'active' | 'archived';

// The item code the QC screen is currently focused on. Sourced from the active list or, for
// a just-started item code with no reports yet, from the Entry-tab selection.
interface FocusedOrder {
  orderId: string;
  customerId: string;
  productId: string;
  customerName: string | null;
  productName: string | null;
  itemCode: string | null;
  orderCode: string | null;
  productionComplete: boolean;
}

// The QC tab inside the Moulding department. No Company → PO → Item Code picker: the active
// item code is whatever the engineer is working on in Entry (req #2). Item codes stay in the
// Active tab after production completes until "QC Done" is pressed, then move to Archived.
export function MouldingQCScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { active } = useMouldingSession();
  const [mode, setMode] = useState<Mode>('active');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Item codes closed this session — so a just-closed one doesn't reappear via the Entry
  // context fallback before the active list refetches.
  const [closedIds, setClosedIds] = useState<string[]>([]);

  const activeOrdersQ = useQuery({
    queryKey: queryKeys.qc.activeOrders('moulding'),
    queryFn: () => qcReportsApi.activeOrders('moulding'),
  });
  const archivedOrdersQ = useQuery({
    queryKey: queryKeys.qc.archivedOrders('moulding'),
    queryFn: () => qcReportsApi.archivedOrders('moulding'),
    enabled: mode === 'archived',
  });

  const listQ = mode === 'active' ? activeOrdersQ : archivedOrdersQ;
  const orders = useMemo<QCActiveOrder[]>(() => listQ.data ?? [], [listQ.data]);

  // Active mode: explicit tap wins, else the current Entry item code, else the most recent.
  // Archived mode: only explicit selection.
  const effectiveId =
    mode === 'active'
      ? focusedId ??
        (active && !closedIds.includes(active.orderId) ? active.orderId : null) ??
        orders.find((o) => !closedIds.includes(o.id))?.id ??
        null
      : focusedId ?? orders[0]?.id ?? null;

  const focused: FocusedOrder | null = useMemo(() => {
    if (!effectiveId) return null;
    if (mode === 'active' && closedIds.includes(effectiveId)) return null;
    const fromList = orders.find((o) => o.id === effectiveId);
    if (fromList) {
      return {
        orderId: fromList.id,
        customerId: fromList.customerId,
        productId: fromList.productId,
        customerName: fromList.customerName,
        productName: fromList.productName,
        itemCode: fromList.itemCode,
        orderCode: fromList.orderCode,
        productionComplete: fromList.productionComplete,
      };
    }
    // A brand-new item code chosen in Entry that has no QC reports yet won't be in the list.
    if (mode === 'active' && active && active.orderId === effectiveId) {
      return {
        orderId: active.orderId,
        customerId: active.customerId,
        productId: active.productId,
        customerName: active.customerName,
        productName: active.productName,
        itemCode: active.itemCode,
        orderCode: active.orderCode,
        productionComplete: false,
      };
    }
    return null;
  }, [effectiveId, orders, active, closedIds, mode]);

  const reportsQ = useQuery({
    queryKey: queryKeys.qc.reports({ department: 'moulding', orderId: focused?.orderId, inline: true }),
    queryFn: () => qcReportsApi.list({ department: 'moulding', orderId: focused!.orderId, limit: 100 }),
    enabled: !!focused,
  });
  const reports: QCReport[] = reportsQ.data?.data ?? [];

  const closeMut = useMutation({
    mutationFn: (orderId: string) => qcReportsApi.closeOrder(orderId, 'moulding'),
    onSuccess: (_res, orderId) => {
      setClosedIds((prev) => (prev.includes(orderId) ? prev : [...prev, orderId]));
      setFocusedId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.qc.activeOrders('moulding') });
      queryClient.invalidateQueries({ queryKey: queryKeys.qc.archivedOrders('moulding') });
    },
  });

  const confirmDone = () => {
    if (!focused) return;
    const orderId = focused.orderId;
    Alert.alert(
      'Mark QC done for this item code?',
      `This permanently completes QC for ${focused.itemCode ?? 'this item code'}: no more QC reports or images can be uploaded, and it moves to Archived QC. Existing cases stay visible to Admin and the customer.`,
      [
        { text: 'Keep documenting', style: 'cancel' },
        { text: 'QC Done', style: 'destructive', onPress: () => closeMut.mutate(orderId) },
      ]
    );
  };

  const otherOrders = orders.filter((o) => o.id !== focused?.orderId);
  const isArchived = mode === 'archived';

  const switchMode = (m: Mode) => {
    setMode(m);
    setFocusedId(null);
  };

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={listQ.isRefetching} onRefresh={listQ.refetch} />}
    >
      <AppText variant="h1" style={{ marginBottom: spacing(1) }}>
        Moulding QC
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(3) }}>
        Report defects for the item code you&apos;re working on — no re-selecting.
      </AppText>

      {/* Active / Archived toggle */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.pill,
          padding: 4,
          marginBottom: spacing(4),
        }}
      >
        {(['active', 'archived'] as Mode[]).map((m) => {
          const on = mode === m;
          return (
            <PressableScale key={m} onPress={() => switchMode(m)} style={{ flex: 1 }}>
              <View
                style={{
                  backgroundColor: on ? colors.primary : 'transparent',
                  borderRadius: radius.pill,
                  paddingVertical: spacing(2),
                  alignItems: 'center',
                }}
              >
                <AppText weight="700" style={{ color: on ? colors.primaryText : colors.textMuted }}>
                  {m === 'active' ? 'Active QC' : 'Archived QC'}
                </AppText>
              </View>
            </PressableScale>
          );
        })}
      </View>

      {focused ? (
        <Card style={{ marginBottom: spacing(4) }}>
          {/* Auto-linked Company → PO → Item Code (req #3) */}
          <View style={{ marginBottom: spacing(3) }}>
            <ContextRow label="Company" value={focused.customerName ?? '—'} />
            <ContextRow label="Item Code" value={focused.itemCode ?? '—'} />
            <ContextRow label="Product" value={focused.productName ?? '—'} last />
          </View>

          {isArchived ? (
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.pill,
                paddingHorizontal: spacing(3),
                paddingVertical: spacing(1),
                marginBottom: spacing(3),
              }}
            >
              <AppText variant="caption" weight="700" tone="muted">
                ✓ QC completed · archived (images removed, history kept)
              </AppText>
            </View>
          ) : focused.productionComplete ? (
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: colors.status.success.bg,
                borderRadius: radius.pill,
                paddingHorizontal: spacing(3),
                paddingVertical: spacing(1),
                marginBottom: spacing(3),
              }}
            >
              <AppText variant="caption" weight="700" style={{ color: colors.status.success.fg }}>
                ✓ Production complete · QC still open
              </AppText>
            </View>
          ) : null}

          {/* Two large actions — active mode only (req #3) */}
          {!isArchived ? (
            <View style={{ gap: spacing(2), marginBottom: spacing(3) }}>
              <Button
                label="＋  New QC Report"
                onPress={() =>
                  navigation.navigate('CreateQCReport', {
                    department: 'moulding',
                    orderId: focused.orderId,
                    customerId: focused.customerId,
                    productId: focused.productId,
                  })
                }
              />
              <Button
                label={`Previous Reports${reports.length ? ` (${reports.length})` : ''}`}
                variant="secondary"
                onPress={() =>
                  navigation.navigate('QCReportsList', {
                    department: 'moulding',
                    orderId: focused.orderId,
                    title: 'Previous Reports',
                  })
                }
              />
            </View>
          ) : null}

          {/* Reports for THIS item code only (req #3) */}
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            {isArchived ? 'QC case history' : 'Uploaded defect reports'}
          </AppText>
          {reportsQ.isLoading ? (
            <AppText tone="muted">Loading…</AppText>
          ) : reports.length === 0 ? (
            <AppText tone="muted" style={{ marginBottom: spacing(2) }}>
              {isArchived ? 'No QC cases were recorded for this item code.' : 'No reports yet. Tap “New QC Report” to add the first one.'}
            </AppText>
          ) : (
            <View style={{ gap: spacing(2) }}>
              {reports.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  onPress={() => navigation.navigate('QCReportDetail', { reportId: r.id })}
                />
              ))}
            </View>
          )}

          {/* QC Done — completes + locks QC for this item code (req #11), active mode only */}
          {!isArchived ? (
            <View style={{ marginTop: spacing(4) }}>
              <Button
                label={closeMut.isPending ? 'Finishing…' : 'QC Done'}
                variant="danger"
                loading={closeMut.isPending}
                onPress={confirmDone}
              />
              <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2), textAlign: 'center' }}>
                Keep uploading photos and defects until you press this. QC Done locks the item code
                and moves it to Archived QC — no more uploads afterwards.
              </AppText>
            </View>
          ) : null}
        </Card>
      ) : (
        <Card style={{ marginBottom: spacing(4) }}>
          <AppText style={{ fontSize: 32, marginBottom: spacing(2) }}>{isArchived ? '📁' : '🔍'}</AppText>
          <AppText weight="600" style={{ marginBottom: spacing(1) }}>
            {isArchived ? 'No archived item codes' : 'No item code selected'}
          </AppText>
          <AppText tone="muted">
            {isArchived
              ? 'Item codes appear here after you press “QC Done”. Their report history is preserved.'
              : 'Open the Entry tab and pick a Company → PO → Item Code. It will appear here automatically so you can report defects without re-selecting anything.'}
          </AppText>
        </Card>
      )}

      {/* Other item codes in this tab */}
      {otherOrders.length > 0 ? (
        <View>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            {isArchived ? 'Other archived item codes' : 'Other item codes awaiting QC'}
          </AppText>
          <View style={{ gap: spacing(2) }}>
            {otherOrders.map((o) => (
              <OrderRow key={o.id} order={o} archived={isArchived} onPress={() => setFocusedId(o.id)} />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function ContextRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing(2),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <AppText tone="muted">{label}</AppText>
      <AppText weight="700">{value}</AppText>
    </View>
  );
}

function ReportRow({ report, onPress }: { report: QCReport; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const sev = SEVERITY_META[report.severity];
  const thumb = report.photos[0]?.url ? resolveMediaUrl(report.photos[0].url) : undefined;
  return (
    <PressableScale onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing(3),
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          padding: spacing(2),
        }}
      >
        <View style={{ width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface }}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <AppText style={{ fontSize: 20 }}>📝</AppText>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="600" numberOfLines={1}>
            {report.defects.length ? report.defects.join(', ') : 'Defect report'}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {[report.machine, report.mould].filter(Boolean).join(' · ') || '—'} · {formatDateTime(report.createdAt)}
            {report.photos.length ? `  · 📸 ${report.photos.length}` : ''}
          </AppText>
        </View>
        <StatusPill label={sev.label} tone={sev.tone} />
      </View>
    </PressableScale>
  );
}

function OrderRow({ order, archived, onPress }: { order: QCActiveOrder; archived?: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale onPress={onPress}>
      <View
        style={[
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing(3),
          },
          shadow('sm'),
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText weight="700">{order.itemCode ?? order.orderCode ?? '—'}</AppText>
          {archived ? (
            <AppText variant="caption" weight="700" tone="muted">
              Archived
            </AppText>
          ) : order.productionComplete ? (
            <AppText variant="caption" weight="700" style={{ color: colors.status.success.fg }}>
              Production done
            </AppText>
          ) : (
            <AppText variant="caption" weight="700" style={{ color: colors.status.progress.fg }}>
              In production
            </AppText>
          )}
        </View>
        <AppText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
          {[order.customerName, order.productName].filter(Boolean).join(' · ') || '—'}
        </AppText>
        <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {order.reportCount} report{order.reportCount === 1 ? '' : 's'}
          {order.openCount ? `  ·  ${order.openCount} open` : ''}
        </AppText>
      </View>
    </PressableScale>
  );
}
