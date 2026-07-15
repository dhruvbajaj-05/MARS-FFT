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

// The order the QC screen is currently focused on. Sourced from the active list or, for a
// just-started order with no reports yet, from the Entry-tab selection.
interface FocusedOrder {
  orderId: string;
  customerId: string;
  productId: string;
  customerName: string | null;
  productName: string | null;
  orderCode: string | null;
  productionComplete: boolean;
}

// The QC tab inside the Moulding department. No Company → Product → Order picker: the
// active order is whatever the engineer is working on in Entry (req #2). Orders stay here
// after production completes until "Done Uploading QC Photos" is pressed (req #11).
export function MouldingQCScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { active } = useMouldingSession();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Orders closed this session — so a just-closed order doesn't reappear via the Entry
  // context fallback before the active-orders list refetches.
  const [closedIds, setClosedIds] = useState<string[]>([]);

  const activeOrdersQ = useQuery({
    queryKey: queryKeys.qc.activeOrders('moulding'),
    queryFn: () => qcReportsApi.activeOrders('moulding'),
  });
  const activeOrders: QCActiveOrder[] = activeOrdersQ.data ?? [];

  // Explicit tap wins, else the current Entry order, else the most recent open QC order.
  const effectiveId =
    focusedId ??
    (active && !closedIds.includes(active.orderId) ? active.orderId : null) ??
    activeOrders.find((o) => !closedIds.includes(o.id))?.id ??
    null;

  const focused: FocusedOrder | null = useMemo(() => {
    if (!effectiveId || closedIds.includes(effectiveId)) return null;
    const fromList = activeOrders.find((o) => o.id === effectiveId);
    if (fromList) {
      return {
        orderId: fromList.id,
        customerId: fromList.customerId,
        productId: fromList.productId,
        customerName: fromList.customerName,
        productName: fromList.productName,
        orderCode: fromList.orderCode,
        productionComplete: fromList.productionComplete,
      };
    }
    // A brand-new order chosen in Entry that has no QC reports yet won't be in the list.
    if (active && active.orderId === effectiveId) {
      return {
        orderId: active.orderId,
        customerId: active.customerId,
        productId: active.productId,
        customerName: active.customerName,
        productName: active.productName,
        orderCode: active.orderCode,
        productionComplete: false,
      };
    }
    return null;
  }, [effectiveId, activeOrders, active, closedIds]);

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
    },
  });

  const confirmDone = () => {
    if (!focused) return;
    const orderId = focused.orderId;
    Alert.alert(
      'Done uploading QC photos?',
      `This locks QC for ${focused.orderCode ?? 'this order'} and removes it from the active QC list. Reports stay visible to Admin and the customer.`,
      [
        { text: 'Keep documenting', style: 'cancel' },
        { text: 'Done', style: 'destructive', onPress: () => closeMut.mutate(orderId) },
      ]
    );
  };

  const otherOrders = activeOrders.filter((o) => o.id !== focused?.orderId);

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 140 }}
      refreshControl={
        <RefreshControl refreshing={activeOrdersQ.isRefetching} onRefresh={activeOrdersQ.refetch} />
      }
    >
      <AppText variant="h1" style={{ marginBottom: spacing(1) }}>
        Moulding QC
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Report defects for the order you're working on — no re-selecting.
      </AppText>

      {focused ? (
        <Card style={{ marginBottom: spacing(4) }}>
          {/* Auto-linked Company → Product → Order (req #3) */}
          <View style={{ marginBottom: spacing(3) }}>
            <ContextRow label="Company" value={focused.customerName ?? '—'} />
            <ContextRow label="Product" value={focused.productName ?? '—'} />
            <ContextRow label="Order ID" value={focused.orderCode ?? '—'} last />
          </View>

          {focused.productionComplete ? (
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

          {/* Two large actions (req #3) */}
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

          {/* Reports for THIS order only (req #3) */}
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Uploaded defect reports
          </AppText>
          {reportsQ.isLoading ? (
            <AppText tone="muted">Loading…</AppText>
          ) : reports.length === 0 ? (
            <AppText tone="muted" style={{ marginBottom: spacing(2) }}>
              No reports yet. Tap “New QC Report” to add the first one.
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

          {/* Done uploading (req #11) */}
          <View style={{ marginTop: spacing(4) }}>
            <Button
              label={closeMut.isPending ? 'Finishing…' : 'Done Uploading QC Photos'}
              variant="danger"
              loading={closeMut.isPending}
              onPress={confirmDone}
            />
            <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2), textAlign: 'center' }}>
              Keep uploading photos and defects until you press this — there is no limit.
            </AppText>
          </View>
        </Card>
      ) : (
        <Card style={{ marginBottom: spacing(4) }}>
          <AppText style={{ fontSize: 32, marginBottom: spacing(2) }}>🔍</AppText>
          <AppText weight="600" style={{ marginBottom: spacing(1) }}>
            No order selected
          </AppText>
          <AppText tone="muted">
            Open the Entry tab and pick a Company → Product → Order. It will appear here
            automatically so you can report defects without re-selecting anything.
          </AppText>
        </Card>
      )}

      {/* Other orders awaiting QC (post-production documentation, req #11) */}
      {otherOrders.length > 0 ? (
        <View>
          <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
            Other orders awaiting QC
          </AppText>
          <View style={{ gap: spacing(2) }}>
            {otherOrders.map((o) => (
              <OrderRow key={o.id} order={o} onPress={() => setFocusedId(o.id)} />
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

function OrderRow({ order, onPress }: { order: QCActiveOrder; onPress: () => void }) {
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
          <AppText weight="700">{order.orderCode ?? '—'}</AppText>
          {order.productionComplete ? (
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
