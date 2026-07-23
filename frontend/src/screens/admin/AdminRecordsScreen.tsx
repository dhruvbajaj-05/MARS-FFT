import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { adminApi } from '@/api/endpoints/admin';
import { queryKeys } from '@/api/queryKeys';
import type {
  AdminAssemblyRecord,
  AdminDispatchRecord,
  AdminMouldingRecord,
  AdminQCRecord,
  Paginated,
} from '@/api/types';
import { AppText, Card, QueryBoundary, Screen, Select, type SelectOption } from '@/components';
import { MouldingRecordsList } from '@/features/moulding/MouldingRecordsList';
import { usePOItemCode } from '@/screens/engineer/usePOItemCode';
import { useTheme } from '@/theme/ThemeProvider';
import { AssemblyCard, DispatchCard, QCCard } from './FactoryMonitorScreen';

// Admin records — the SAME Customer → Purchase Order → Item Code cascade and record UI that
// the department engineers use, with a department selector on top. Moulding renders the exact
// grouped Shift → Cavity view from the engineer's "My Records" page (read-only); the other
// departments render their admin record cards. Store records are a future department.
type Dept = 'moulding' | 'assembly' | 'qc' | 'dispatch' | 'store';

const DEPT_OPTIONS: SelectOption[] = [
  { label: 'Moulding', value: 'moulding' },
  { label: 'Assembly', value: 'assembly' },
  { label: 'QC', value: 'qc' },
  { label: 'Dispatch', value: 'dispatch' },
  { label: 'Store', value: 'store', hint: 'Coming soon' },
];

// Moulding view — identical to the engineer My Records page, read-only.
function AdminMouldingRecords({ orderId, itemCodeFor }: { orderId: string; itemCodeFor: (id?: string | null) => string }) {
  const params = { orderId, limit: 200 };
  const query = useQuery({
    queryKey: queryKeys.admin.records.moulding(params),
    queryFn: () => adminApi.mouldingRecords(params),
  });
  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      data={query.data}
      onRetry={query.refetch}
    >
      {(d) => (
        <MouldingRecordsList
          records={d.data as AdminMouldingRecord[]}
          itemCodeFor={itemCodeFor}
        />
      )}
    </QueryBoundary>
  );
}

// Assembly / QC / Dispatch — the admin record cards, scoped to the selected item code.
function AdminFlatRecords({ orderId, dept }: { orderId: string; dept: Exclude<Dept, 'moulding' | 'store'> }) {
  const params = { orderId, limit: 100 };
  const query = useQuery<Paginated<AdminAssemblyRecord | AdminQCRecord | AdminDispatchRecord>>({
    queryKey: queryKeys.admin.records[dept](params),
    queryFn: () =>
      dept === 'assembly'
        ? adminApi.assemblyRecords(params)
        : dept === 'qc'
          ? adminApi.qcRecords(params)
          : adminApi.dispatchRecords(params),
  });
  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      data={query.data}
      onRetry={query.refetch}
    >
      {(d) =>
        d.data.length === 0 ? (
          <AppText tone="muted">No {dept} records for this item code.</AppText>
        ) : (
          <View>
            {dept === 'assembly' && (d.data as AdminAssemblyRecord[]).map((r) => <AssemblyCard key={r.id} r={r} />)}
            {dept === 'qc' && (d.data as AdminQCRecord[]).map((r) => <QCCard key={r.id} r={r} />)}
            {dept === 'dispatch' && (d.data as AdminDispatchRecord[]).map((r) => <DispatchCard key={r.id} r={r} />)}
          </View>
        )
      }
    </QueryBoundary>
  );
}

export function AdminRecordsScreen() {
  const { spacing } = useTheme();
  const [dept, setDept] = useState<Dept>('moulding');
  const cp = usePOItemCode();
  const { customerId, jobId } = cp;

  const itemCodeFor = (id?: string | null) =>
    cp.jobList.find((o) => o.id === id)?.itemCode ?? cp.itemCode ?? 'Item';

  const ready = !!jobId;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={cp.refreshing} onRefresh={cp.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
        Production Records
      </AppText>
      <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(3) }}>
        Pick a department, then drill Customer → Purchase Order → Item Code to view its records.
      </AppText>

      {/* Department selector */}
      <Card style={{ marginBottom: spacing(3) }}>
        <Select label="Department" value={dept} options={DEPT_OPTIONS} onChange={(v) => setDept(v as Dept)} />
      </Card>

      {dept === 'store' ? (
        <AppText tone="muted">Store records are coming soon.</AppText>
      ) : (
        <>
          <Card style={{ marginBottom: spacing(4) }}>
            <Select
              label="Customer"
              value={customerId}
              options={cp.customerOptions}
              onChange={cp.selectCustomer}
              placeholder="Select a customer…"
            />
            <Select
              label="Purchase Order"
              value={cp.purchaseOrderId}
              options={cp.purchaseOrderOptions}
              onChange={(v) => cp.selectPurchaseOrder(v)}
              placeholder={customerId ? 'Select a purchase order…' : 'Select a customer first'}
              emptyHint="No purchase orders for this customer"
            />
            <Select
              label="Item Code"
              value={jobId}
              options={cp.jobOptions}
              onChange={(v) => cp.setJobId(v)}
              placeholder={cp.purchaseOrderId ? 'Select an item code…' : 'Select a purchase order first'}
              emptyHint="No item codes in this PO"
            />
          </Card>

          {!ready ? (
            <AppText tone="muted">Select a customer, purchase order and item code to view records.</AppText>
          ) : dept === 'moulding' ? (
            <AdminMouldingRecords orderId={jobId!} itemCodeFor={itemCodeFor} />
          ) : (
            <AdminFlatRecords orderId={jobId!} dept={dept} />
          )}
        </>
      )}
    </Screen>
  );
}
