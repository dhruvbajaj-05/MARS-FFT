import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl, View } from 'react-native';

import { customerApi } from '@/api/endpoints/customer';
import { queryKeys } from '@/api/queryKeys';
import type { CustomerProductOrderRow } from '@/api/types';
import {
  AppText,
  ErrorState,
  GaugeBar,
  PremiumEmpty,
  PressableScale,
  Screen,
  SkeletonCard,
  StatusPill,
  shadow,
  statusTone,
} from '@/components';
import type { CustomerStackParamList } from '@/navigation/CustomerHomeNavigator';
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/format';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'CustomerProduct'>;
type Rt = RouteProp<CustomerStackParamList, 'CustomerProduct'>;

const STAGES: { key: keyof CustomerProductOrderRow['stageReached']; label: string; icon: string }[] = [
  { key: 'moulding', label: 'Mould', icon: '🧱' },
  { key: 'assembly', label: 'Assembly', icon: '🔧' },
  { key: 'qc', label: 'QC', icon: '🔍' },
  { key: 'dispatch', label: 'Dispatch', icon: '🚚' },
];

// Compact 4-stage pipeline showing how far the order has progressed.
function StagePipeline({ reached }: { reached: CustomerProductOrderRow['stageReached'] }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) }}>
      {STAGES.map((s) => {
        const on = reached[s.key];
        return (
          <View key={s.key} style={{ flex: 1, alignItems: 'center' }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: on ? colors.status.success.bg : colors.surfaceAlt,
                borderWidth: 1.5,
                borderColor: on ? colors.status.success.fg : colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: on ? 1 : 0.55,
              }}
            >
              <AppText style={{ fontSize: 15 }}>{s.icon}</AppText>
            </View>
            <AppText
              variant="caption"
              weight={on ? '700' : '500'}
              style={{ color: on ? colors.text : colors.textMuted, marginTop: 4, fontSize: 10 }}
            >
              {s.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

function OrderCard({ order, onPress }: { order: CustomerProductOrderRow; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale onPress={onPress} style={{ marginBottom: spacing(3) }}>
      <View
        style={[
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing(4),
            borderWidth: 0.5,
            borderColor: colors.border,
          },
          shadow('sm'),
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(3) }}>
          <View>
            <AppText variant="h3">{order.poNumber ?? order.orderCode}</AppText>
            <AppText variant="caption" tone="muted">
              {order.orderQuantity.toLocaleString()} units · {relativeTime(order.createdAt, 'Placed')}
            </AppText>
          </View>
          <StatusPill label={order.status} tone={statusTone(order.status)} />
        </View>

        <GaugeBar pct={order.progressPct} tone={statusTone(order.status)} showLabel />
        <StagePipeline reached={order.stageReached} />

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing(3) }}>
          <AppText variant="caption" weight="700" style={{ color: colors.primary }}>Open dashboard ›</AppText>
        </View>
      </View>
    </PressableScale>
  );
}

export function CustomerProductScreen() {
  const { spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const query = useQuery({
    queryKey: queryKeys.customer.productOrders(params.productId),
    queryFn: () => customerApi.productOrders(params.productId),
  });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <View style={{ marginBottom: spacing(4) }}>
        <AppText variant="h1">{query.data?.product.itemCode ?? params.productName}</AppText>
        <AppText tone="muted" style={{ marginTop: spacing(1) }}>
          {query.data?.product.name ?? params.productName}
          {query.data ? ` · ${query.data.orders.length} order${query.data.orders.length !== 1 ? 's' : ''}` : ''}
        </AppText>
      </View>

      {query.isLoading ? (
        <View>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : query.isError ? (
        <ErrorState message="We couldn't load these orders." onRetry={query.refetch} />
      ) : !query.data || query.data.orders.length === 0 ? (
        <PremiumEmpty icon="📋" title="No orders yet" message="Orders for this product will appear here." />
      ) : (
        <View>
          {query.data.orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onPress={() => navigation.navigate('CustomerOrder', { orderId: o.id, orderCode: o.orderCode })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
