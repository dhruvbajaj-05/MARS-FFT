import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl } from 'react-native';

import type { Paginated } from '@/api/types';
import { queryKeys } from '@/api/queryKeys';
import { AppText, KPIGrid, QueryBoundary, Screen } from '@/components';
import { departmentForRole } from '@/features/engineer/department';
import { useCurrentUser } from '@/hooks/useAuth';
import { useTheme } from '@/theme/ThemeProvider';

// Client-composed engineer dashboard (Gap #3, approved): there is no server-side
// engineer summary endpoint, so headline stats are derived from the first page of
// the engineer's own records (`/<dept>/mine`). Total reflects pagination.total.
export function EngineerDashboardScreen() {
  const { spacing } = useTheme();
  const user = useCurrentUser();
  const dept = user ? departmentForRole(user.role) : null;

  const query = useQuery({
    queryKey: queryKeys.dept(dept?.key ?? 'none').mine({ page: 1, limit: 50 }),
    queryFn: () => dept!.api.listMine({ page: 1, limit: 50 }) as Promise<Paginated<unknown>>,
    enabled: !!dept,
  });

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        {dept?.label ?? 'Dashboard'}
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Welcome back, {user?.name}
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
              { label: `My ${dept?.recordNoun}s`, value: d.pagination.total, tone: 'info' },
              { label: 'Loaded This Page', value: d.data.length, tone: 'neutral' },
            ]}
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
