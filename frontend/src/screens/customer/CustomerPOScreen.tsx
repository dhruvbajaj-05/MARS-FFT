import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl, View } from 'react-native';

import { customerApi } from '@/api/endpoints/customer';
import { queryKeys } from '@/api/queryKeys';
import type { CustomerPOItemRow } from '@/api/types';
import {
  AppText,
  ErrorState,
  GaugeBar,
  PremiumEmpty,
  PressableScale,
  Screen,
  SkeletonCard,
  StatGrid,
  StatTile,
  StatusPill,
  shadow,
  statusTone,
} from '@/components';
import type { CustomerStackParamList } from '@/navigation/CustomerHomeNavigator';
import { StagePipeline } from '@/screens/customer/StagePipeline';
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/format';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'CustomerPO'>;
type Rt = RouteProp<CustomerStackParamList, 'CustomerPO'>;

// One Item Code inside a PO. Shows the item code + part, quantity, overall progress and the
// pipeline it has reached. Tap to open the full moulding/assembly/QC/dispatch dashboard.
function ItemCodeCard({ order, onPress }: { order: CustomerPOItemRow; onPress: () => void }) {
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(3) }}>
          <View style={{ flex: 1, marginRight: spacing(2) }}>
            <AppText variant="h3" numberOfLines={1}>{order.itemCode ?? order.orderCode}</AppText>
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {[order.productName, order.partName].filter(Boolean).join(' · ') || order.orderCode}
            </AppText>
            <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {order.orderQuantity.toLocaleString()} units · {relativeTime(order.createdAt, 'Placed')}
            </AppText>
          </View>
          <StatusPill label={order.status} tone={statusTone(order.status)} />
        </View>

        <GaugeBar pct={order.progressPct} tone={statusTone(order.status)} showLabel />

        <View style={{ marginTop: spacing(3) }}>
          <StatGrid>
            <StatTile label="Order Qty" value={order.orderQuantity} />
            <StatTile label="Dispatched" value={order.dispatchedQuantity} tone="success" />
            <StatTile label="Progress" value={`${order.progressPct}%`} tone={statusTone(order.status)} />
          </StatGrid>
        </View>

        <StagePipeline reached={order.stageReached} />

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing(3) }}>
          <AppText variant="caption" weight="700" style={{ color: colors.primary }}>Open dashboard ›</AppText>
        </View>
      </View>
    </PressableScale>
  );
}

export function CustomerPOScreen() {
  const { spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const query = useQuery({
    queryKey: queryKeys.customer.purchaseOrder(params.purchaseOrderId),
    queryFn: () => customerApi.purchaseOrder(params.purchaseOrderId),
  });
  const po = query.data?.purchaseOrder;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <View style={{ marginBottom: spacing(4) }}>
        <AppText variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Purchase Order
        </AppText>
        <AppText variant="h1" style={{ marginTop: 2 }}>{po?.poNumber ?? params.poNumber}</AppText>
        {po ? (
          <AppText tone="muted" style={{ marginTop: spacing(1) }}>
            {po.itemCount} item code{po.itemCount !== 1 ? 's' : ''} · {po.totalQuantity.toLocaleString()} units · {po.progressPct}% complete
          </AppText>
        ) : null}
        {po?.notes ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(1) }}>{po.notes}</AppText>
        ) : null}
      </View>

      {query.isLoading ? (
        <View>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : query.isError ? (
        <ErrorState message="We couldn't load this purchase order." onRetry={query.refetch} />
      ) : !query.data || query.data.orders.length === 0 ? (
        <PremiumEmpty icon="📋" title="No item codes yet" message="Item codes for this purchase order will appear here." />
      ) : (
        <View>
          {query.data.orders.map((o) => (
            <ItemCodeCard
              key={o.id}
              order={o}
              onPress={() => navigation.navigate('CustomerOrder', { orderId: o.id, orderCode: o.itemCode ?? o.orderCode })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
