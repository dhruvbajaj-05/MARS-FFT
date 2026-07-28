import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl, View } from 'react-native';

import { customerApi } from '@/api/endpoints/customer';
import { queryKeys } from '@/api/queryKeys';
import type { CustomerPO } from '@/api/types';
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

type Nav = NativeStackNavigationProp<CustomerStackParamList, 'CustomerHome'>;

// A Purchase Order card — the top level of the customer portal. Shows the PO's overall
// production progress, item-code count, quantity fulfilment and how far the pipeline has
// reached. Tap to drill into the PO's item codes.
function POCard({ po, onPress }: { po: CustomerPO; onPress: () => void }) {
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
            <AppText variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Purchase Order
            </AppText>
            <AppText variant="h3" numberOfLines={2} style={{ marginTop: 2 }}>{po.poNumber ?? 'PO'}</AppText>
          </View>
          {/* Finished POs show their real lifecycle badge (Completed / Archived); active ones
              show the live production stage. */}
          {po.archived ? (
            <StatusPill label={po.poStatus === 'Completed' ? 'Completed' : 'Archived'} tone="neutral" />
          ) : (
            <StatusPill label={po.status} tone={statusTone(po.status)} />
          )}
        </View>

        <GaugeBar pct={po.progressPct} tone={statusTone(po.status)} showLabel />

        <View style={{ marginTop: spacing(3) }}>
          <StatGrid>
            <StatTile label="Item Codes" value={po.itemCount} tone="progress" emphasize />
            <StatTile label="Order Qty" value={po.totalQuantity} />
            <StatTile label="Dispatched" value={po.dispatchedQuantity} tone="success" />
          </StatGrid>
        </View>

        <StagePipeline reached={po.stageReached} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(3) }}>
          <AppText variant="caption" tone="muted">{relativeTime(po.lastUpdatedAt)}</AppText>
          <AppText variant="caption" weight="700" style={{ color: colors.primary }}>View item codes ›</AppText>
        </View>
      </View>
    </PressableScale>
  );
}

// A two-way Active/Archived segmented control. Each segment carries its own count so the
// customer can see at a glance how many POs live in each bucket.
function POFilterTabs({
  tab,
  onChange,
  activeCount,
  archivedCount,
}: {
  tab: 'active' | 'archived';
  onChange: (t: 'active' | 'archived') => void;
  activeCount: number;
  archivedCount: number;
}) {
  const { colors, radius, spacing } = useTheme();
  const tabs: { key: 'active' | 'archived'; label: string; count: number }[] = [
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'archived', label: 'Archived', count: archivedCount },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing(1.5),
        backgroundColor: colors.surfaceAlt ?? colors.border,
        borderRadius: radius.pill,
        padding: spacing(1),
        marginBottom: spacing(4),
      }}
    >
      {tabs.map((t) => {
        const selected = tab === t.key;
        return (
          <PressableScale key={t.key} onPress={() => onChange(t.key)} style={{ flex: 1 }}>
            <View
              style={[
                {
                  paddingVertical: spacing(2.5),
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  backgroundColor: selected ? colors.surface : 'transparent',
                },
                selected ? shadow('sm') : null,
              ]}
            >
              <AppText weight={selected ? '700' : '600'} tone={selected ? 'default' : 'muted'}>
                {t.label} · {t.count}
              </AppText>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function CustomerHomeScreen() {
  const { spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const query = useQuery({ queryKey: queryKeys.customer.purchaseOrders, queryFn: customerApi.purchaseOrders });
  const [tab, setTab] = React.useState<'active' | 'archived'>('active');

  const allPos = query.data?.purchaseOrders ?? [];
  const activePos = allPos.filter((po) => !po.archived);
  const archivedPos = allPos.filter((po) => po.archived);
  const visiblePos = tab === 'archived' ? archivedPos : activePos;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      {/* Header */}
      <View style={{ marginBottom: spacing(5) }}>
        <AppText variant="caption" tone="muted" weight="600" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {query.data?.customer ?? 'Manufacturing'}
        </AppText>
        <AppText variant="h1" style={{ marginTop: spacing(1) }}>Purchase Orders</AppText>
        <AppText tone="muted" style={{ marginTop: spacing(1) }}>
          Live production status across every order, moulding to dispatch.
        </AppText>
      </View>

      {query.isLoading ? (
        <View>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : query.isError ? (
        <ErrorState message="We couldn't load your purchase orders." onRetry={query.refetch} />
      ) : allPos.length === 0 ? (
        <PremiumEmpty
          icon="📦"
          title="No purchase orders yet"
          message="Once your orders are placed, they'll appear here with live production progress."
        />
      ) : (
        <View>
          <POFilterTabs
            tab={tab}
            onChange={setTab}
            activeCount={activePos.length}
            archivedCount={archivedPos.length}
          />
          {visiblePos.length === 0 ? (
            <PremiumEmpty
              icon={tab === 'archived' ? '🗄️' : '📦'}
              title={tab === 'archived' ? 'No archived purchase orders' : 'No active purchase orders'}
              message={
                tab === 'archived'
                  ? 'Completed purchase orders will move here once production wraps up.'
                  : 'All your purchase orders are complete — check the Archived tab.'
              }
            />
          ) : (
            visiblePos.map((po) => (
              <POCard
                key={po.id}
                po={po}
                onPress={() => navigation.navigate('CustomerPO', { purchaseOrderId: po.id, poNumber: po.poNumber ?? 'PO' })}
              />
            ))
          )}
        </View>
      )}
    </Screen>
  );
}
