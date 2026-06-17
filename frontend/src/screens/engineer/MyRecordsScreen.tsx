import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { RefreshControl, View } from 'react-native';

import type { Paginated } from '@/api/types';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Card, QueryBoundary, Screen, Select } from '@/components';
import { departmentForRole } from '@/features/engineer/department';
import { useCurrentUser } from '@/hooks/useAuth';
import { useTheme } from '@/theme/ThemeProvider';
import { useCustomerProduct } from './useCustomerProduct';

// Loose record shape — the four department records share these display-relevant keys.
type AnyRecord = {
  id: string;
  createdAt: string;
  orderId?: string;
  partName?: string;
  moldName?: string;
  machineNumber?: string;
  shift?: string;
  cavity?: number;
  shotsDone?: number;
  rejectedParts?: number;
  goodParts?: number;
  productionQuantity?: number;
  assembledSets?: number;
  extraSets?: number;
  fromSurplus?: boolean;
  assembledQuantity?: number;
  acceptedQuantity?: number;
  packedQuantity?: number;
};

// Full moulding field line (#9 visibility): Shift · Machine · Mold · Part · Cavity ·
// Shots · Rejects · Good. Returns null for non-moulding records.
function mouldingDetail(r: AnyRecord): string | null {
  if (r.goodParts === undefined) return null;
  return [
    r.shift ? `Shift ${r.shift}` : null,
    r.machineNumber ? `M/C ${r.machineNumber}` : null,
    r.cavity !== undefined ? `${r.cavity} cav` : null,
    r.shotsDone !== undefined ? `${r.shotsDone} shots` : null,
    r.rejectedParts !== undefined ? `${r.rejectedParts} rej` : null,
    r.goodParts !== undefined ? `${r.goodParts} good` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Engineer → My Records. Lists the calling engineer's own submissions for their dept.
// For Moulding and Assembly, records are browsed through the Customer → Product →
// (optional OrderID) hierarchy: pick a Customer, then a Product (only that customer's
// products), and all records for that customer + product are shown — optionally narrowed
// to one OrderID. Other departments keep the flat list.
export function MyRecordsScreen() {
  const user = useCurrentUser();
  const dept = user ? departmentForRole(user.role) : null;
  const isFiltered = dept?.key === 'moulding' || dept?.key === 'assembly';

  if (isFiltered) {
    return <FilteredRecords dept={dept!} />;
  }

  return <FlatRecords dept={dept ?? null} />;
}

// ---- Moulding / Assembly: Customer → Product → OrderID filtered records ----
function FilteredRecords({ dept }: { dept: NonNullable<ReturnType<typeof departmentForRole>> }) {
  const { spacing } = useTheme();
  const cp = useCustomerProduct();
  const { customerId, productId, orderId } = cp;

  const params = {
    page: 1,
    limit: 100,
    customerId: customerId ?? undefined,
    productId: productId ?? undefined,
    orderId: orderId ?? undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.dept(dept.key).mine(params),
    queryFn: () => dept.api.listMine(params) as Promise<Paginated<AnyRecord>>,
    enabled: !!customerId && !!productId,
  });

  // Map orderId → OrderID code (FFT-#####) for display on each card.
  const orderCodeFor = (id?: string): string => {
    if (!id) return 'Order';
    return cp.orderList.find((o) => o.id === id)?.orderCode ?? id;
  };

  const ready = !!customerId && !!productId;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        My {dept.recordNoun}s
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        <Select
          label="Customer"
          value={customerId}
          options={cp.customerOptions}
          onChange={cp.selectCustomer}
          placeholder="Select a customer…"
        />
        <Select
          label="Product"
          value={productId}
          options={cp.productOptions}
          onChange={cp.selectProduct}
          placeholder={customerId ? 'Select a product…' : 'Select a customer first'}
          emptyHint={customerId ? 'No products for this customer' : 'Select a customer first'}
        />
        {ready ? (
          <Select
            label="OrderID (optional)"
            value={orderId}
            options={[{ label: 'All orders', value: '' }, ...cp.orderOptions]}
            onChange={(v) => cp.setOrderId(v === '' ? null : v)}
            placeholder="All orders"
          />
        ) : null}
      </Card>

      {!ready ? (
        <AppText tone="muted">Select a customer and product to view {dept.recordNoun.toLowerCase()}s.</AppText>
      ) : (
        <QueryBoundary
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          data={query.data}
          onRetry={query.refetch}
        >
          {(d) =>
            d.data.length === 0 ? (
              <AppText tone="muted">No {dept.recordNoun.toLowerCase()}s for this selection.</AppText>
            ) : (
              <View style={{ gap: spacing(2) }}>
                {d.data.map((r) => (
                  <Card key={r.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: spacing(2) }}>
                        <AppText weight="600">{summarize(r)}</AppText>
                        {mouldingDetail(r) ? (
                          <AppText variant="caption" tone="muted">{mouldingDetail(r)}</AppText>
                        ) : null}
                        <AppText variant="caption" tone="muted">
                          {new Date(r.createdAt).toLocaleString()}
                        </AppText>
                      </View>
                      <AppText weight="700">{orderCodeFor(r.orderId)}</AppText>
                    </View>
                  </Card>
                ))}
              </View>
            )
          }
        </QueryBoundary>
      )}
    </Screen>
  );
}

// ---- Other departments: flat list of the engineer's own records ----
function FlatRecords({ dept }: { dept: ReturnType<typeof departmentForRole> }) {
  const { spacing } = useTheme();
  const params = { page: 1, limit: 50 };
  const query = useQuery({
    queryKey: queryKeys.dept(dept?.key ?? 'none').mine(params),
    queryFn: () => dept!.api.listMine(params) as Promise<Paginated<AnyRecord>>,
    enabled: !!dept,
  });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        My {dept?.recordNoun ?? 'Record'}s
      </AppText>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
      >
        {(d) =>
          d.data.length === 0 ? (
            <AppText tone="muted">No records yet.</AppText>
          ) : (
            <View style={{ gap: spacing(2) }}>
              {d.data.map((r) => (
                <Card key={r.id}>
                  <AppText weight="600">{summarize(r)}</AppText>
                  <AppText variant="caption" tone="muted">
                    {new Date(r.createdAt).toLocaleString()}
                  </AppText>
                </Card>
              ))}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}

function summarize(r: AnyRecord): string {
  if (r.goodParts !== undefined) {
    const shots = r.shotsDone !== undefined && r.cavity !== undefined ? ` · ${r.shotsDone}×${r.cavity}` : '';
    return `${r.moldName ?? ''} · ${r.partName ?? ''}${shots} · good ${r.goodParts}`;
  }
  if (r.fromSurplus) return `Extra ${r.extraSets ?? 0} sets (from surplus)`;
  if (r.assembledSets !== undefined) return `Assembled ${r.assembledSets} sets`;
  if (r.assembledQuantity !== undefined) return `Assembled ${r.assembledQuantity}`;
  if (r.acceptedQuantity !== undefined) return `Approved ${r.acceptedQuantity}`;
  if (r.packedQuantity !== undefined) return `Dispatched ${r.packedQuantity}`;
  return r.id;
}
