import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { adminApi } from '@/api/endpoints/admin';
import { queryKeys } from '@/api/queryKeys';
import type {
  AdminAssemblyRecord,
  AdminDispatchRecord,
  AdminMouldingRecord,
  AdminOrderRow,
  AdminQCRecord,
  Paginated,
} from '@/api/types';

type AnyRecord = AdminMouldingRecord | AdminAssemblyRecord | AdminQCRecord | AdminDispatchRecord;
import { AppText, Card, Screen } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

type Dept = 'moulding' | 'assembly' | 'qc' | 'dispatch';

function fmt(n: number) {
  return n.toLocaleString();
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A big, prominent metric tile used in the moulding record card.
function Metric({ label, value, color, align = 'flex-start' }: { label: string; value: string; color?: string; align?: 'flex-start' | 'center' | 'flex-end' }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: align }}>
      <AppText variant="caption" tone="muted" style={{ marginBottom: 2 }}>{label}</AppText>
      <AppText weight="700" style={{ fontSize: 22, color: color ?? colors.text }}>{value}</AppText>
    </View>
  );
}

function MouldingCard({ r }: { r: AdminMouldingRecord }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Card style={{ marginBottom: spacing(4), padding: spacing(4) }}>
      {/* Header: mould name is the headline, order code on the right */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
        <AppText variant="h3" style={{ flex: 1 }} numberOfLines={1}>
          {r.moldName}
        </AppText>
        <View
          style={{
            backgroundColor: colors.status.info.bg,
            borderRadius: radius.sm,
            paddingHorizontal: spacing(2),
            paddingVertical: spacing(1),
            marginLeft: spacing(2),
          }}
        >
          <AppText variant="caption" weight="700" style={{ color: colors.status.info.fg }}>
            {r.orderCode ?? '—'}
          </AppText>
        </View>
      </View>
      <AppText tone="muted" style={{ marginBottom: spacing(3) }}>
        {r.customer ?? '—'}  ·  {r.product ?? '—'}  ·  {r.partName}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) }}>
        {[
          { label: 'Machine', value: r.machineNumber },
          { label: 'Shift', value: `Shift ${r.shift}` },
          { label: 'Cavity', value: String(r.cavity) },
        ].map((chip) => (
          <View
            key={chip.label}
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: spacing(3),
              paddingVertical: spacing(2),
            }}
          >
            <AppText variant="caption" tone="muted">{chip.label} </AppText>
            <AppText variant="caption" weight="700">{chip.value}</AppText>
          </View>
        ))}
      </View>

      {/* Big metric tiles */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md ?? 12,
          padding: spacing(3),
        }}
      >
        <Metric label="Shots Done" value={fmt(r.shotsDone)} />
        <Metric
          label="Rejected"
          value={fmt(r.rejectedShots)}
          color={r.rejectedShots > 0 ? colors.status.danger.fg : colors.status.success.fg}
          align="center"
        />
        <Metric label="Good Parts" value={fmt(r.goodParts)} color={colors.status.success.fg} align="flex-end" />
      </View>

      {r.rejectionReasons.length > 0 && (
        <AppText variant="caption" style={{ color: colors.status.danger.fg, marginTop: spacing(3) }}>
          Defects: {r.rejectionReasons.join(', ')}
        </AppText>
      )}

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(3) }}>
        {shortDate(r.createdAt)}
      </AppText>
    </Card>
  );
}

function AssemblyCard({ r }: { r: AdminAssemblyRecord }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Card style={{ marginBottom: spacing(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
        <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
          {r.customer ?? '—'}
        </AppText>
        <AppText variant="caption" style={{ color: colors.primary, marginLeft: spacing(2) }}>
          {r.orderCode ?? '—'}
        </AppText>
      </View>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
        {r.product ?? '—'}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(2) }}>
        {[
          { label: 'Line', value: r.assemblyLine },
          { label: 'Shift', value: `Shift ${r.shift}` },
          { label: 'Operators', value: String(r.operatorCount) },
        ].map((chip) => (
          <View
            key={chip.label}
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: spacing(2),
              paddingVertical: spacing(1),
            }}
          >
            <AppText variant="caption" tone="muted">{chip.label} </AppText>
            <AppText variant="caption" weight="600">{chip.value}</AppText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <AppText variant="caption" tone="muted">Input</AppText>
          <AppText weight="700">{fmt(r.inputQuantity)}</AppText>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AppText variant="caption" tone="muted">Assembled</AppText>
          <AppText weight="700" style={{ color: colors.status.success.fg }}>
            {fmt(r.assembledQuantity)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" tone="muted">Rejected</AppText>
          <AppText weight="700" style={{ color: r.rejectedQuantity > 0 ? colors.status.danger.fg : colors.text }}>
            {fmt(r.rejectedQuantity)}
          </AppText>
        </View>
      </View>

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
        {shortDate(r.createdAt)}
      </AppText>
    </Card>
  );
}

function QCCard({ r }: { r: AdminQCRecord }) {
  const { colors, spacing, radius } = useTheme();
  const approvalPct =
    r.sampleSize > 0 ? Math.round((r.acceptedQuantity / r.sampleSize) * 100) : 0;
  return (
    <Card style={{ marginBottom: spacing(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
        <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
          {r.customer ?? '—'}
        </AppText>
        <AppText variant="caption" style={{ color: colors.primary, marginLeft: spacing(2) }}>
          {r.orderCode ?? '—'}
        </AppText>
      </View>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
        {r.product ?? '—'}  ·  {r.inspectionType}
      </AppText>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(2) }}>
        <View>
          <AppText variant="caption" tone="muted">Sample</AppText>
          <AppText weight="700">{fmt(r.sampleSize)}</AppText>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AppText variant="caption" tone="muted">Accepted</AppText>
          <AppText weight="700" style={{ color: colors.status.success.fg }}>
            {fmt(r.acceptedQuantity)}
          </AppText>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AppText variant="caption" tone="muted">Rejected</AppText>
          <AppText weight="700" style={{ color: r.rejectedQuantity > 0 ? colors.status.danger.fg : colors.text }}>
            {fmt(r.rejectedQuantity)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" tone="muted">Pass Rate</AppText>
          <AppText
            weight="700"
            style={{ color: approvalPct >= 95 ? colors.status.success.fg : colors.status.danger.fg }}
          >
            {approvalPct}%
          </AppText>
        </View>
      </View>

      {r.defects.length > 0 && (
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing(2) }}>
          <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>Defects</AppText>
          {r.defects.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="caption">{d.defectType}</AppText>
              <AppText variant="caption" weight="600">{d.quantity}</AppText>
            </View>
          ))}
        </View>
      )}

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
        {shortDate(r.inspectionDate)}
      </AppText>
    </Card>
  );
}

function DispatchCard({ r }: { r: AdminDispatchRecord }) {
  const { colors, spacing } = useTheme();
  return (
    <Card style={{ marginBottom: spacing(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
        <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
          {r.customer ?? '—'}
        </AppText>
        <AppText variant="caption" style={{ color: colors.primary, marginLeft: spacing(2) }}>
          {r.orderCode ?? '—'}
        </AppText>
      </View>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
        {r.product ?? '—'}
      </AppText>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(2) }}>
        <View>
          <AppText variant="caption" tone="muted">Packed</AppText>
          <AppText weight="700" style={{ color: colors.status.success.fg }}>
            {fmt(r.packedQuantity)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" tone="muted">Cartons</AppText>
          <AppText weight="700">{r.cartonCount}</AppText>
        </View>
      </View>

      <View style={{ gap: spacing(1) }}>
        <AppText variant="caption" tone="muted">
          Transporter: <AppText variant="caption" weight="600">{r.transporterName}</AppText>
        </AppText>
        <AppText variant="caption" tone="muted">
          Vehicle: <AppText variant="caption" weight="600">{r.vehicleNumber}</AppText>
        </AppText>
        <AppText variant="caption" tone="muted">
          LR: <AppText variant="caption" weight="600">{r.lrNumber}</AppText>
          {'   '}Invoice: <AppText variant="caption" weight="600">{r.invoiceNumber}</AppText>
        </AppText>
      </View>

      <AppText variant="caption" tone="muted" style={{ marginTop: spacing(2) }}>
        Dispatched: {shortDate(r.dispatchDate)}
      </AppText>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Grouped Production Records: Customer → Product → Order → Stage → Records.
// Orders (with per-stage counts + customer/product identity) come from a single
// adminApi.orders() call and are grouped client-side. The records themselves are
// LAZY-loaded per (order, stage) only when that stage node is expanded, so hundreds
// of records never load at once.
// ---------------------------------------------------------------------------

const STAGES: { key: Dept; label: string; countKey: keyof AdminOrderRow }[] = [
  { key: 'moulding', label: 'Moulding Records', countKey: 'mouldingCount' },
  { key: 'assembly', label: 'Assembly Records', countKey: 'assemblyCount' },
  { key: 'qc', label: 'QC Records', countKey: 'qcCount' },
  { key: 'dispatch', label: 'Dispatch Records', countKey: 'dispatchCount' },
];

// Lazily fetch + render one order's records for one stage. Mounted only when expanded.
function StageRecords({ orderId, stage }: { orderId: string; stage: Dept }) {
  const { spacing, colors } = useTheme();
  const params = { orderId, limit: 100 };
  const q = useQuery({
    queryKey: queryKeys.admin.records[stage](params),
    queryFn: (): Promise<Paginated<AnyRecord>> =>
      stage === 'moulding'
        ? adminApi.mouldingRecords(params)
        : stage === 'assembly'
          ? adminApi.assemblyRecords(params)
          : stage === 'qc'
            ? adminApi.qcRecords(params)
            : adminApi.dispatchRecords(params),
  });

  if (q.isLoading) {
    return <AppText tone="muted" variant="caption" style={{ paddingVertical: spacing(2) }}>Loading…</AppText>;
  }
  if (q.isError) {
    return (
      <AppText variant="caption" style={{ color: colors.status.danger.fg, paddingVertical: spacing(2) }}>
        Failed to load records.
      </AppText>
    );
  }
  const rows = q.data?.data ?? [];
  if (rows.length === 0) {
    return <AppText tone="muted" variant="caption" style={{ paddingVertical: spacing(2) }}>No records.</AppText>;
  }
  return (
    <View style={{ paddingTop: spacing(2) }}>
      {stage === 'moulding' && (rows as AdminMouldingRecord[]).map((r) => <MouldingCard key={r.id} r={r} />)}
      {stage === 'assembly' && (rows as AdminAssemblyRecord[]).map((r) => <AssemblyCard key={r.id} r={r} />)}
      {stage === 'qc' && (rows as AdminQCRecord[]).map((r) => <QCCard key={r.id} r={r} />)}
      {stage === 'dispatch' && (rows as AdminDispatchRecord[]).map((r) => <DispatchCard key={r.id} r={r} />)}
    </View>
  );
}

// A tappable row with a disclosure chevron used at every level of the tree.
function DisclosureRow({
  open,
  title,
  subtitle,
  right,
  depth = 0,
  disabled,
  onPress,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  right?: string;
  depth?: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { spacing, colors } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing(2),
        paddingLeft: spacing(2 + depth * 3),
        paddingRight: spacing(2),
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <AppText style={{ width: 18, color: colors.textMuted }}>{disabled ? '·' : open ? '▾' : '▸'}</AppText>
      <View style={{ flex: 1 }}>
        <AppText weight="600">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted">{subtitle}</AppText>
        ) : null}
      </View>
      {right ? (
        <AppText variant="caption" weight="600" tone="muted" style={{ marginLeft: spacing(2) }}>{right}</AppText>
      ) : null}
    </Pressable>
  );
}

interface ProductGroup {
  productId: string;
  product: string;
  itemCode: string | null;
  orders: AdminOrderRow[];
}
interface CustomerGroup {
  customerId: string;
  customer: string;
  products: ProductGroup[];
}

export function FactoryMonitorScreen() {
  const { spacing, colors, radius } = useTheme();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const isOpen = (key: string) => expanded.has(key);

  const ordersQ = useQuery({
    queryKey: queryKeys.admin.orders({ page: 1, limit: 200 }),
    queryFn: () => adminApi.orders({ page: 1, limit: 200 }),
  });

  // Group orders that have at least one record into Customer → Product → Order.
  const groups = useMemo<CustomerGroup[]>(() => {
    const rows = ordersQ.data?.data ?? [];
    const withRecords = rows.filter(
      (o) => (o.mouldingCount ?? 0) + (o.assemblyCount ?? 0) + (o.qcCount ?? 0) + (o.dispatchCount ?? 0) > 0,
    );
    const custMap = new Map<string, CustomerGroup>();
    for (const o of withRecords) {
      const custId = o.customerId ?? 'unknown';
      const prodId = o.productId ?? 'unknown';
      if (!custMap.has(custId)) {
        custMap.set(custId, { customerId: custId, customer: o.customer ?? 'Unknown customer', products: [] });
      }
      const cust = custMap.get(custId)!;
      let prod = cust.products.find((p) => p.productId === prodId);
      if (!prod) {
        prod = { productId: prodId, product: o.product ?? 'Unknown product', itemCode: o.itemCode ?? null, orders: [] };
        cust.products.push(prod);
      }
      prod.orders.push(o);
    }
    return Array.from(custMap.values());
  }, [ordersQ.data]);

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={ordersQ.isRefetching} onRefresh={ordersQ.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        Production Records
      </AppText>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(4) }}>
        Customer → Item Code → Job → Stage. Expand to drill into records.
      </AppText>

      {ordersQ.isLoading ? (
        <AppText tone="muted" style={{ textAlign: 'center', marginTop: spacing(8) }}>Loading…</AppText>
      ) : ordersQ.isError ? (
        <AppText style={{ color: colors.status.danger.fg, textAlign: 'center', marginTop: spacing(8) }}>
          Failed to load orders.
        </AppText>
      ) : groups.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: spacing(8) }}>
          <AppText style={{ fontSize: 36 }}>📭</AppText>
          <AppText tone="muted" style={{ marginTop: spacing(2) }}>No production records yet</AppText>
        </View>
      ) : (
        <View style={{ gap: spacing(3) }}>
          {groups.map((cust) => {
            const custKey = `cust:${cust.customerId}`;
            const orderCount = cust.products.reduce((s, p) => s + p.orders.length, 0);
            return (
              <Card key={custKey} style={{ padding: 0, overflow: 'hidden' }}>
                <DisclosureRow
                  open={isOpen(custKey)}
                  title={cust.customer}
                  right={`${orderCount} order${orderCount !== 1 ? 's' : ''}`}
                  onPress={() => toggle(custKey)}
                />
                {isOpen(custKey) &&
                  cust.products.map((prod) => {
                    const prodKey = `prod:${cust.customerId}|${prod.productId}`;
                    return (
                      <View key={prodKey} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                        <DisclosureRow
                          open={isOpen(prodKey)}
                          title={prod.itemCode ? `${prod.itemCode} · ${prod.product}` : prod.product}
                          subtitle={`${prod.orders.length} job${prod.orders.length !== 1 ? 's' : ''}`}
                          depth={1}
                          onPress={() => toggle(prodKey)}
                        />
                        {isOpen(prodKey) &&
                          prod.orders.map((order) => {
                            const orderKey = `order:${order.id}`;
                            return (
                              <View key={orderKey} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                                <DisclosureRow
                                  open={isOpen(orderKey)}
                                  title={order.orderCode ?? 'Order'}
                                  subtitle={`${order.orderQuantity} sets · ${order.lifecycleStatus ?? order.status}`}
                                  depth={2}
                                  onPress={() => toggle(orderKey)}
                                />
                                {isOpen(orderKey) &&
                                  STAGES.map((stg) => {
                                    const count = (order[stg.countKey] as number | undefined) ?? 0;
                                    const stageKey = `stage:${order.id}|${stg.key}`;
                                    return (
                                      <View key={stageKey}>
                                        <DisclosureRow
                                          open={isOpen(stageKey)}
                                          title={stg.label}
                                          right={String(count)}
                                          depth={3}
                                          disabled={count === 0}
                                          onPress={() => toggle(stageKey)}
                                        />
                                        {isOpen(stageKey) && count > 0 ? (
                                          <View
                                            style={{
                                              paddingLeft: spacing(2 + 4 * 3),
                                              paddingRight: spacing(3),
                                              paddingBottom: spacing(2),
                                              backgroundColor: colors.surfaceAlt,
                                              borderRadius: radius.sm,
                                            }}
                                          >
                                            <StageRecords orderId={order.id} stage={stg.key} />
                                          </View>
                                        ) : null}
                                      </View>
                                    );
                                  })}
                              </View>
                            );
                          })}
                      </View>
                    );
                  })}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
