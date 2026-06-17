import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl } from 'react-native';

import { customerApi } from '@/api/endpoints/customer';
import { queryKeys } from '@/api/queryKeys';
import { AppText, KPIGrid, QueryBoundary, Screen } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

export function CustomerDashboardScreen() {
  const { spacing } = useTheme();
  const query = useQuery({ queryKey: queryKeys.customer.dashboard, queryFn: customerApi.dashboard });

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(4) }}>
        My Orders Overview
      </AppText>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
      >
        {(d) => (
          <KPIGrid
            items={[
              { label: 'Total Orders', value: d.totalOrders, tone: 'neutral' },
              { label: 'Active', value: d.activeOrders, tone: 'progress' },
              { label: 'Completed', value: d.completedOrders, tone: 'success' },
              { label: `Delayed (>${d.delayedPolicy.thresholdDays}d)`, value: d.delayedOrders, tone: 'danger' },
            ]}
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
