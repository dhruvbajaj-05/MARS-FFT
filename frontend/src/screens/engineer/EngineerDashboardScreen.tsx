import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { mouldingApi } from '@/api/endpoints/moulding';
import { purchaseOrdersApi } from '@/api/endpoints/purchaseOrders';
import type { MouldingPOCard, Paginated } from '@/api/types';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Card, KPIGrid, PressableScale, QueryBoundary, Screen } from '@/components';
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

// A PO card that expands to reveal its item codes (Item Code dominant). Fetches the PO
// detail lazily only when opened.
function POCard({ po, archived }: { po: MouldingPOCard; archived?: boolean }) {
  const { spacing, colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: queryKeys.purchaseOrder(po.id),
    queryFn: () => purchaseOrdersApi.get(po.id),
    enabled: open,
  });

  return (
    <PressableScale onPress={() => setOpen((o) => !o)}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="h3">{po.poNumber ?? 'PO'}</AppText>
            <AppText variant="caption" tone="muted">
              {po.customerName ?? '—'} · {po.itemCount} item code{po.itemCount === 1 ? '' : 's'}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText
              variant="caption"
              weight="700"
              style={{ color: archived ? colors.textMuted : colors.status.progress.fg }}
            >
              {archived ? 'Production complete' : `${po.activeItems} in production`}
            </AppText>
            <AppText style={{ color: colors.textMuted, fontSize: 18 }}>{open ? '▾' : '▸'}</AppText>
          </View>
        </View>

        {open ? (
          <View style={{ marginTop: spacing(3), gap: spacing(2) }}>
            {detail.isLoading ? (
              <AppText tone="muted" variant="caption">Loading item codes…</AppText>
            ) : (
              (detail.data?.jobs ?? []).map((job) => (
                <View
                  key={job.id}
                  style={{
                    backgroundColor: colors.surfaceAlt,
                    borderRadius: radius.md,
                    padding: spacing(3),
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <AppText weight="700" style={{ fontSize: 15 }}>{job.itemCode ?? '—'}</AppText>
                    <AppText variant="caption" tone="muted">{job.productName}</AppText>
                  </View>
                  <AppText
                    variant="caption"
                    weight="700"
                    style={{ color: job.productionStatus === 'Completed' ? colors.status.success.fg : colors.status.progress.fg }}
                  >
                    {job.productionStatus === 'Completed' ? 'Done' : 'In production'}
                  </AppText>
                </View>
              ))
            )}
          </View>
        ) : null}
      </Card>
    </PressableScale>
  );
}

// ---- Moulding dashboard: Active / Archived Purchase Orders (req #4) ----
function MouldingDashboard({ userName }: { userName: string }) {
  const { spacing } = useTheme();
  const query = useQuery({
    queryKey: queryKeys.mouldingPoDashboard,
    queryFn: () => mouldingApi.poDashboard(),
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
        {(d) => (
          <View>
            <AppText variant="h3" style={{ marginBottom: spacing(2) }}>Active POs</AppText>
            {d.active.length === 0 ? (
              <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
                No purchase orders in production. New POs appear here automatically.
              </AppText>
            ) : (
              <View style={{ gap: spacing(3), marginBottom: spacing(5) }}>
                {d.active.map((po) => (
                  <POCard key={po.id} po={po} />
                ))}
              </View>
            )}

            {d.archived.length > 0 ? (
              <>
                <AppText variant="h3" style={{ marginBottom: spacing(2) }}>Archived POs</AppText>
                <View style={{ gap: spacing(3) }}>
                  {d.archived.map((po) => (
                    <POCard key={po.id} po={po} archived />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        )}
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
