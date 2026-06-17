import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl } from 'react-native';

import { adminApi } from '@/api/endpoints/admin';
import { queryKeys } from '@/api/queryKeys';
import { AppText, KPIGrid, QueryBoundary, Screen } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

export function AdminDashboardScreen() {
  const { spacing } = useTheme();
  const query = useQuery({ queryKey: queryKeys.admin.dashboard, queryFn: adminApi.dashboard });

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(4) }}>
        Admin Dashboard
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
              { label: 'Customers', value: d.totalCustomers, tone: 'info' },
              { label: 'Products', value: d.totalProducts, tone: 'neutral' },
              { label: 'Total Orders', value: d.totalOrders, tone: 'neutral' },
              { label: 'Active Orders', value: d.activeOrders, tone: 'progress' },
              { label: 'Completed Orders', value: d.completedOrders, tone: 'success' },
            ]}
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
