import { useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl, View } from 'react-native';

import { adminApi } from '@/api/endpoints/admin';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Card, Screen } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

function fmt(n: number) {
  return n.toLocaleString();
}

function shortDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

type StageStatus = 'done' | 'active' | 'pending';

interface StageProps {
  emoji: string;
  label: string;
  status: StageStatus;
  lines: { label: string; value: string }[];
  isLast?: boolean;
}

function TimelineStage({ emoji, label, status, lines, isLast }: StageProps) {
  const { colors, spacing, radius } = useTheme();

  const dotColor =
    status === 'done'
      ? colors.status.success.fg
      : status === 'active'
        ? colors.primary
        : colors.textMuted;

  const bgColor =
    status === 'done'
      ? colors.status.success.bg
      : status === 'active'
        ? colors.status.info.bg
        : colors.surfaceAlt;

  const statusLabel =
    status === 'done' ? 'Complete' : status === 'active' ? 'In Progress' : 'Pending';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {/* Timeline connector */}
      <View style={{ alignItems: 'center', width: 40 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: bgColor,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: dotColor,
          }}
        >
          <AppText style={{ fontSize: 16 }}>{emoji}</AppText>
        </View>
        {!isLast && (
          <View
            style={{
              width: 2,
              flex: 1,
              minHeight: 24,
              backgroundColor: status === 'done' ? colors.status.success.fg : colors.border,
              marginTop: spacing(1),
              marginBottom: spacing(1),
            }}
          />
        )}
      </View>

      {/* Stage content */}
      <View style={{ flex: 1, marginLeft: spacing(3), marginBottom: spacing(4) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(2) }}>
          <AppText weight="700" style={{ fontSize: 15 }}>{label}</AppText>
          <View
            style={{
              backgroundColor: bgColor,
              borderRadius: radius.pill,
              paddingHorizontal: spacing(2),
              paddingVertical: 2,
            }}
          >
            <AppText variant="caption" weight="600" style={{ color: dotColor }}>
              {statusLabel}
            </AppText>
          </View>
        </View>
        {lines.length > 0 && (
          <Card style={{ padding: spacing(3) }}>
            {lines.map((line, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: spacing(1),
                  borderBottomWidth: i < lines.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <AppText variant="caption" tone="muted">{line.label}</AppText>
                <AppText variant="caption" weight="600">{line.value}</AppText>
              </View>
            ))}
          </Card>
        )}
      </View>
    </View>
  );
}

function stageStatus(count: number, isCompleted: boolean): StageStatus {
  if (isCompleted) return 'done';
  if (count > 0) return 'active';
  return 'pending';
}

export function OrderTimelineScreen() {
  const { spacing, colors, radius } = useTheme();
  const route = useRoute<any>();
  const { orderId } = route.params as { orderId: string };

  const query = useQuery({
    queryKey: queryKeys.admin.orderTimeline(orderId),
    queryFn: () => adminApi.orderTimeline(orderId),
  });

  const o = query.data;

  const mouldingStatus = stageStatus(
    o?.mouldingCount ?? 0,
    o?.productionStatus === 'Completed',
  );
  const assemblyStatus = stageStatus(
    o?.assemblyCount ?? 0,
    o?.assemblyStatus === 'Completed',
  );
  const qcStatus = stageStatus(o?.qcCount ?? 0, false);
  const dispatchStatus = stageStatus(o?.dispatchCount ?? 0, o?.lifecycleStatus === 'Completed');

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      {/* Order Header */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing(4),
          marginBottom: spacing(5),
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
          {o?.orderCode ?? route.params?.orderCode ?? '—'}
        </AppText>
        <AppText tone="muted" variant="caption">{o?.customer ?? '—'}</AppText>
        <AppText tone="muted" variant="caption">{o?.product ?? '—'}</AppText>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: spacing(3),
          }}
        >
          <View>
            <AppText variant="caption" tone="muted">Order Qty</AppText>
            <AppText weight="700">{fmt(o?.orderQuantity ?? 0)} sets</AppText>
          </View>
          <View style={{ alignItems: 'center' }}>
            <AppText variant="caption" tone="muted">Dispatched</AppText>
            <AppText weight="700" style={{ color: colors.status.success.fg }}>
              {fmt(o?.dispatchedQuantity ?? 0)}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="caption" tone="muted">Progress</AppText>
            <AppText weight="700">{o?.progressPct ?? 0}%</AppText>
          </View>
        </View>
        {o?.createdAt && (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
            Created: {shortDate(o.createdAt)}
          </AppText>
        )}
      </View>

      {/* Loading / Error */}
      {query.isLoading && (
        <AppText tone="muted" style={{ textAlign: 'center', marginTop: spacing(8) }}>
          Loading timeline…
        </AppText>
      )}
      {query.isError && (
        <AppText style={{ color: colors.status.danger.fg, textAlign: 'center', marginTop: spacing(8) }}>
          Failed to load timeline.
        </AppText>
      )}

      {/* Timeline */}
      {o && (
        <>
          <AppText variant="h3" style={{ marginBottom: spacing(4) }}>Production Timeline</AppText>

          <TimelineStage
            emoji="🏭"
            label="Moulding"
            status={mouldingStatus}
            lines={[
              { label: 'Records', value: String(o.mouldingCount ?? 0) },
              { label: 'Good Parts Produced', value: fmt(o.mouldingGoodParts) },
              ...(o.productionCompletedAt
                ? [{ label: 'Completed On', value: shortDate(o.productionCompletedAt) ?? '—' }]
                : []),
            ]}
          />

          <TimelineStage
            emoji="🔧"
            label="Assembly"
            status={assemblyStatus}
            lines={[
              { label: 'Records', value: String(o.assemblyCount ?? 0) },
              { label: 'Sets Assembled', value: fmt(o.assembledQuantity) },
              ...(o.assemblyCompletedAt
                ? [{ label: 'Completed On', value: shortDate(o.assemblyCompletedAt) ?? '—' }]
                : []),
            ]}
          />

          <TimelineStage
            emoji="✅"
            label="Quality Control"
            status={qcStatus}
            lines={[
              { label: 'Inspections', value: String(o.qcCount ?? 0) },
              { label: 'QC Accepted', value: fmt(o.qcAcceptedQuantity) },
            ]}
          />

          <TimelineStage
            emoji="🚚"
            label="Dispatch"
            status={dispatchStatus}
            lines={[
              { label: 'Shipments', value: String(o.dispatchCount ?? 0) },
              { label: 'Dispatched Qty', value: fmt(o.dispatchedQuantity) },
            ]}
            isLast
          />
        </>
      )}
    </Screen>
  );
}
