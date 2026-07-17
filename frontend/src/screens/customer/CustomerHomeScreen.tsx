import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl, View } from 'react-native';

import { customerApi } from '@/api/endpoints/customer';
import { queryKeys } from '@/api/queryKeys';
import type { CustomerProduct } from '@/api/types';
import {
  AppText,
  BrandTile,
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
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/format';

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'CustomerHome'>;

function ProductCard({ product, onPress }: { product: CustomerProduct; onPress: () => void }) {
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
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing(3) }}>
          <BrandTile name={product.itemCode ?? product.name} size={52} />
          <View style={{ flex: 1, marginLeft: spacing(3) }}>
            <AppText variant="h3" numberOfLines={1}>{product.itemCode ?? product.name}</AppText>
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {product.name}{product.partName ? ` · ${product.partName}` : ''}
            </AppText>
          </View>
          <StatusPill label={product.status} tone={statusTone(product.status)} />
        </View>

        <GaugeBar pct={product.progressPct} tone={statusTone(product.status)} showLabel />

        <View style={{ marginTop: spacing(3) }}>
          <StatGrid>
            <StatTile label="Active Orders" value={product.activeOrders} tone="progress" emphasize />
            <StatTile label="Total Orders" value={product.totalOrders} />
            <StatTile label="Progress" value={`${product.progressPct}%`} tone={statusTone(product.status)} />
          </StatGrid>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(3) }}>
          <AppText variant="caption" tone="muted">{relativeTime(product.lastUpdatedAt)}</AppText>
          <AppText variant="caption" weight="700" style={{ color: colors.primary }}>View orders ›</AppText>
        </View>
      </View>
    </PressableScale>
  );
}

export function CustomerHomeScreen() {
  const { spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const query = useQuery({ queryKey: queryKeys.customer.products, queryFn: customerApi.products });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      {/* Header */}
      <View style={{ marginBottom: spacing(5) }}>
        <AppText variant="caption" tone="muted" weight="600" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {query.data?.customer ?? 'Manufacturing'}
        </AppText>
        <AppText variant="h1" style={{ marginTop: spacing(1) }}>Your Products</AppText>
        <AppText tone="muted" style={{ marginTop: spacing(1) }}>
          Live production status across every order.
        </AppText>
      </View>

      {query.isLoading ? (
        <View>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : query.isError ? (
        <ErrorState message="We couldn't load your products." onRetry={query.refetch} />
      ) : !query.data || query.data.products.length === 0 ? (
        <PremiumEmpty
          icon="📦"
          title="No products yet"
          message="Once production begins, your products will appear here with live progress."
        />
      ) : (
        <View>
          {query.data.products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onPress={() => navigation.navigate('CustomerProduct', { productId: p.id, productName: p.name })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
