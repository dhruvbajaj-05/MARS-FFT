import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { masterApi } from '@/api/master';
import { purchaseOrdersApi, type PurchaseOrderListParams } from '@/api/purchaseOrders';
import { errorMessage } from '@/api/client';
import type { PurchaseOrderStatus } from '@/api/types';
import { Banner, PageHeader, Panel, QueryState, SelectField, TextField } from '@/components/ui';

type Line = { productId: string; quantity: string };
const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'Open' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Archived', value: 'Archived' },
];

// Admin → Purchase Orders. A PO belongs to one company and groups several independent Item
// Code jobs; creating it spawns one production job per line. Same flow as the mobile screen,
// re-laid-out for desktop (create panel on top, filterable list below).
export function PurchaseOrdersPage() {
  const qc = useQueryClient();

  // Create form state.
  const [customerId, setCustomerId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '' }]);
  const [ok, setOk] = useState<string | null>(null);

  // Filters.
  const [fCustomerId, setFCustomerId] = useState('');
  const [fStatus, setFStatus] = useState('');

  const customers = useQuery({
    queryKey: ['customers', { limit: 100 }],
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }),
  });
  const products = useQuery({
    queryKey: ['products', { customerId, limit: 200 }],
    queryFn: () => masterApi.listProducts({ customerId, limit: 200 }),
    enabled: !!customerId,
  });

  const listParams: PurchaseOrderListParams = {
    limit: 100,
    customerId: fCustomerId || undefined,
    status: (fStatus as PurchaseOrderStatus) || undefined,
  };
  const pos = useQuery({
    queryKey: ['purchase-orders', listParams],
    queryFn: () => purchaseOrdersApi.list(listParams),
  });

  const customerOptions = (customers.data?.data ?? []).map((c) => ({ label: c.name, value: c.id }));
  const productOptions = (products.data?.data ?? []).map((p) => ({
    label: p.itemCode ? `${p.itemCode} · ${p.name}` : p.name,
    value: p.id,
  }));

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { productId: '', quantity: '' }]);
  const removeLine = (i: number) => setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));

  const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
  const canCreate = !!customerId && !!poNumber.trim() && validLines.length > 0;

  const create = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.create({
        customerId,
        poNumber: poNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: validLines.map((l) => ({ productId: l.productId, orderQuantity: Number(l.quantity) })),
      }),
    onSuccess: (res) => {
      setOk(
        `${res.purchaseOrder.poNumber ?? 'PO'} created with ${res.jobs.length} item code${res.jobs.length === 1 ? '' : 's'}.`,
      );
      setPoNumber('');
      setNotes('');
      setLines([{ productId: '', quantity: '' }]);
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const statusClass = (s: string) =>
    s === 'Completed' ? 'tag tag-green' : s === 'Archived' ? 'tag' : 'tag tag-blue';

  return (
    <div className="page">
      <PageHeader title="Purchase Orders" subtitle="Group item-code production jobs under a company PO" />

      <Panel title="Create purchase order">
        {ok && <Banner tone="success">{ok}</Banner>}
        {create.isError && <Banner tone="error">{errorMessage(create.error)}</Banner>}

        <div className="form-grid">
          <SelectField
            label="Customer"
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setLines([{ productId: '', quantity: '' }]);
            }}
            options={customerOptions}
            placeholder="Select customer"
          />
          <TextField
            label="PO name / number"
            value={poNumber}
            onChange={setPoNumber}
            placeholder="e.g. PO/2026/ACME/07"
            hint="Shown everywhere this PO appears. Must be unique."
          />
        </div>

        <div className="subhead">Item codes in this PO</div>
        {lines.map((l, i) => (
          <div className="line-row" key={i}>
            <SelectField
              label="Item code"
              value={l.productId}
              onChange={(v) => updateLine(i, { productId: v })}
              options={productOptions}
              placeholder={customerId ? 'Select item code' : 'Select a customer first'}
              disabled={!customerId}
            />
            <TextField
              label="Sets"
              type="number"
              value={l.quantity}
              onChange={(v) => updateLine(i, { quantity: v })}
              placeholder="e.g. 5000"
            />
            <button
              className="btn-ghost line-remove"
              onClick={() => removeLine(i)}
              disabled={lines.length === 1}
              title="Remove line"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="link-btn" onClick={addLine}>
          + Add item code
        </button>

        <TextField label="Notes (optional)" value={notes} onChange={setNotes} placeholder="e.g. Q3 toy line" />

        <button
          className="btn-primary"
          disabled={!canCreate || create.isPending}
          onClick={() => {
            setOk(null);
            create.mutate();
          }}
        >
          {create.isPending ? 'Creating PO…' : 'Create purchase order'}
        </button>
      </Panel>

      <div className="filter-row">
        <SelectField
          label="Customer"
          value={fCustomerId}
          onChange={setFCustomerId}
          options={customerOptions}
          placeholder="All customers"
        />
        <SelectField label="Status" value={fStatus} onChange={setFStatus} options={STATUS_FILTERS} />
      </div>

      <Panel title="All purchase orders">
        <QueryState isLoading={pos.isLoading} isError={pos.isError} error={pos.error} isEmpty={!pos.data?.data.length}>
          <div className="list">
            {pos.data?.data.map((po) => (
              <Link className="list-row link" to={`/admin/purchase-orders/${po.id}`} key={po.id}>
                <div>
                  <div className="list-title">{po.poNumber ?? po.id}</div>
                  <div className="list-sub">
                    {po.customerName ?? '—'} · {po.jobCount ?? 0} item code{po.jobCount === 1 ? '' : 's'}
                    {po.completedJobs != null && po.jobCount ? ` · ${po.completedJobs}/${po.jobCount} done` : ''}
                    {po.totalQuantity != null ? ` · ${po.totalQuantity.toLocaleString()} sets` : ''}
                  </div>
                </div>
                <span className={statusClass(po.status)}>{po.status}</span>
              </Link>
            ))}
          </div>
        </QueryState>
      </Panel>
    </div>
  );
}
