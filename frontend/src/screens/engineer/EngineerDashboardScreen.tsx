import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl, View } from 'react-native';

import { mouldingApi } from '@/api/endpoints/moulding';
import type { Paginated } from '@/api/types';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Card, KPIGrid, QueryBoundary, Screen } from '@/components';
import { QCIssuesCard } from '@/components/qc';
import { departmentForRole } from '@/features/engineer/department';
import { useCurrentUser } from '@/hooks/useAuth';
import { useTheme } from '@/theme/ThemeProvider';

// Moulding dashboard: hierarchical view — Company → Product → Active Orders (req #1).
// Other departments keep the original flat stats view.
export function EngineerDashboardScreen() {
  const user = useCurrentUser();
  const dept = user ? departmentForRole(user.role) : null;
  const isMoulding = dept?.key === 'moulding';

  if (isMoulding) {
    return <MouldingDashboard userName={user?.name ?? ''} />;
  }

  return <GenericDashboard dept={dept} userName={user?.name ?? ''} />;
}

// ---- Moulding dashboard: companies with products and their active order counts ----
function MouldingDashboard({ userName }: { userName: string }) {
  const { spacing, colors } = useTheme(); // spacing used in View gap
  const query = useQuery({
    queryKey: queryKeys.mouldingDashboard,
    queryFn: () => mouldingApi.dashboard(),
  });

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        Moulding
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Welcome back, {userName}
      </AppText>

      <View style={{ marginBottom: spacing(4) }}>
        <QCIssuesCard department="moulding" />
      </View>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
      >
        {(customers) => {
          if (!customers || customers.length === 0) {
            return <AppText tone="muted">No customers yet. Ask admin to create one.</AppText>;
          }
          return (
            <View style={{ gap: spacing(3) }}>
              {customers.map((c) => (
                <Card key={c.id}>
                  <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
                    {c.name}
                  </AppText>
                  {c.products.length === 0 ? (
                    <AppText variant="caption" tone="muted">
                      No products yet.
                    </AppText>
                  ) : (
                    <View style={{ gap: spacing(2) }}>
                      {c.products.map((p) => (
                        <View
                          key={p.id}
                          style={{
                            paddingVertical: spacing(2),
                            paddingHorizontal: spacing(3),
                            borderRadius: 8,
                            backgroundColor: p.activeOrders > 0 ? colors.status.progress.bg : colors.surfaceAlt,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: spacing(2) }}>
                              <AppText weight="700">{p.itemCode ?? '—'}</AppText>
                              <AppText variant="caption" tone="muted">{p.name}</AppText>
                            </View>
                            {p.activeOrders > 0 ? (
                              <View
                                style={{
                                  backgroundColor: colors.status.progress.fg,
                                  borderRadius: 12,
                                  paddingHorizontal: spacing(2),
                                  paddingVertical: 2,
                                }}
                              >
                                <AppText
                                  variant="caption"
                                  weight="700"
                                  style={{ color: colors.status.progress.bg }}
                                >
                                  {p.activeOrders} Active {p.activeOrders === 1 ? 'Job' : 'Jobs'}
                                </AppText>
                              </View>
                            ) : (
                              <AppText variant="caption" tone="muted">
                                No active jobs
                              </AppText>
                            )}
                          </View>

                          {/* Moulds currently running for this product (req #8) */}
                          {p.runningMoulds && p.runningMoulds.length > 0 ? (
                            <View style={{ marginTop: spacing(2) }}>
                              <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>
                                Running Moulds
                              </AppText>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
                                {p.runningMoulds.map((m) => (
                                  <View
                                    key={`${m.moldName}-${m.cavity}`}
                                    style={{
                                      backgroundColor: colors.surface,
                                      borderRadius: 10,
                                      paddingHorizontal: spacing(3),
                                      paddingVertical: spacing(1),
                                      borderWidth: 1,
                                      borderColor: colors.border,
                                    }}
                                  >
                                    <AppText variant="caption" weight="700">
                                      {m.cavity} Cavity
                                    </AppText>
                                    <AppText variant="caption" tone="muted">
                                      {m.moldName}
                                    </AppText>
                                  </View>
                                ))}
                              </View>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              ))}
            </View>
          );
        }}
      </QueryBoundary>
    </Screen>
  );
}

// ---- Generic dashboard for other departments ----
function GenericDashboard({
  dept,
  userName,
}: {
  dept: ReturnType<typeof departmentForRole>;
  userName: string;
}) {
  const { spacing } = useTheme();

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
        Welcome back, {userName}
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
