import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { masterApi } from '@/api/endpoints/master';
import { purchaseOrdersApi } from '@/api/endpoints/purchaseOrders';
import { queryKeys } from '@/api/queryKeys';
import type { Customer, Paginated, POJob, PurchaseOrder } from '@/api/types';
import type { SelectOption } from '@/components';

export const SHIFT_OPTIONS: SelectOption[] = [
  { label: 'Shift A', value: 'A' },
  { label: 'Shift B', value: 'B' },
  { label: 'Shift C', value: 'C' },
];

interface UsePOItemCodeOptions {
  // Restrict which Item Code jobs of the selected PO are offered — e.g. only jobs whose
  // production is still active (Moulding) or assembly is still active (Assembly). Jobs that
  // fail the filter drop out of the Item Code dropdown automatically.
  jobFilter?: (job: POJob) => boolean;
}

// Shared Company → Purchase Order → Item Code cascade used by every engineer entry form.
// Selecting an Item Code yields the underlying production job (an Order) plus its product
// identity, so forms get customerId / productId / orderId / itemCode without re-selecting.
export function usePOItemCode(opts: UsePOItemCodeOptions = {}) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: queryKeys.customers({ page: 1, limit: 100 }),
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }) as Promise<Paginated<Customer>>,
  });

  const poParams = { customerId: customerId ?? undefined, limit: 100 };
  const purchaseOrders = useQuery({
    queryKey: queryKeys.purchaseOrders(poParams),
    queryFn: () => purchaseOrdersApi.list(poParams),
    enabled: !!customerId,
  });

  // The selected PO's Item Code jobs (with product identity + lifecycle flags).
  const jobsQuery = useQuery({
    queryKey: queryKeys.purchaseOrder(purchaseOrderId ?? 'none'),
    queryFn: () => purchaseOrdersApi.get(purchaseOrderId!),
    enabled: !!purchaseOrderId,
  });

  const customerOptions: SelectOption[] = (customers.data?.data ?? []).map((c) => ({
    label: c.name,
    value: c.id,
  }));

  // Engineers pick from open work: hide archived POs.
  const poList: PurchaseOrder[] = (purchaseOrders.data?.data ?? []).filter((p) => p.status !== 'Archived');
  const purchaseOrderOptions: SelectOption[] = poList.map((p) => ({
    label: p.poNumber ?? p.id,
    value: p.id,
    hint: p.jobCount != null ? `${p.jobCount} item code${p.jobCount === 1 ? '' : 's'}` : undefined,
  }));

  const allJobs: POJob[] = jobsQuery.data?.jobs ?? [];
  const jobList: POJob[] = opts.jobFilter ? allJobs.filter(opts.jobFilter) : allJobs;
  const jobOptions: SelectOption[] = jobList.map((j) => ({
    label: j.itemCode ? `${j.itemCode} — ${j.productName ?? ''}`.trim() : j.productName ?? j.orderCode ?? j.id,
    value: j.id,
    hint: `${j.orderQuantity} sets`,
  }));

  const selectedJob: POJob | null = jobList.find((j) => j.id === jobId) ?? null;
  const selectedPO: PurchaseOrder | null = poList.find((p) => p.id === purchaseOrderId) ?? null;

  const selectCustomer = (v: string) => {
    setCustomerId(v);
    setPurchaseOrderId(null);
    setJobId(null);
  };
  const selectPurchaseOrder = (v: string) => {
    setPurchaseOrderId(v);
    setJobId(null);
  };

  // Combined refresh for the currently-relevant query (jobs when a PO is picked, else POs).
  const refreshing = purchaseOrderId ? jobsQuery.isRefetching : purchaseOrders.isRefetching;
  const refetch = useMemo(
    () => () => (purchaseOrderId ? jobsQuery.refetch() : purchaseOrders.refetch()),
    [purchaseOrderId, jobsQuery, purchaseOrders]
  );

  return {
    // selection state
    customerId,
    purchaseOrderId,
    jobId,
    // derived
    productId: selectedJob?.productId ?? null,
    itemCode: selectedJob?.itemCode ?? null,
    selectedJob,
    selectedPO,
    // setters
    selectCustomer,
    selectPurchaseOrder,
    setJobId,
    // options
    customerOptions,
    purchaseOrderOptions,
    jobOptions,
    // raw queries + lists
    customers,
    purchaseOrders,
    jobsQuery,
    jobList,
    // refresh helpers
    refreshing,
    refetch,
  };
}
