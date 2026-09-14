import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { masterApi } from '@/api/master';
import { purchaseOrdersApi } from '@/api/purchaseOrders';
import { errorMessage } from '@/api/client';
import type { PurchaseOrderStatus } from '@/api/types';
import { Banner, PageHeader, Panel, QueryState, SelectField, TextField } from '@/components/ui';

const STATUS_OPTIONS: { label: string; value: PurchaseOrderStatus }[] = [
  { label: 'Open', value: 'Open' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Archived', value: 'Archived' },
];

// Admin → Purchase Order detail. Manage the item-code jobs inside a PO (add / remove lines),
// edit its status + notes, or delete the whole PO. Adding a line spawns a new production job.
export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => purchaseOrdersApi.get(id),
  });
  const po = detail.data?.purchaseOrder;

  // Products for the "add item code" picker (scoped to the PO's customer).
  const products = useQuery({
    queryKey: ['products', { customerId: po?.customerId, limit: 200 }],
    queryFn: () => masterApi.listProducts({ customerId: po?.customerId ?? undefined, limit: 200 }),
    enabled: !!po?.customerId,
  });
  const productOptions = (products.data?.data ?? []).map((p) => ({
    label: p.itemCode ? `${p.itemCode} · ${p.name}` : p.name,
    value: p.id,
  }));

  // Add-line form.
  const [newProductId, setNewProductId] = useState('');
  const [newQty, setNewQty] = useState('');
  const addLine = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.addLine(id, { productId: newProductId, orderQuantity: Number(newQty) }),
    onSuccess: () => {
      setNewProductId('');
      setNewQty('');
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const removeLine = useMutation({
    mutationFn: (jobId: string) => purchaseOrdersApi.removeLine(id, jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  // Edit status + notes.
  const [status, setStatus] = useState<PurchaseOrderStatus | ''>('');
  const [notes, setNotes] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.update(id, {
        status: (status || po?.status) as PurchaseOrderStatus,
        notes: notes ?? po?.notes ?? undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation({
    mutationFn: () => purchaseOrdersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      navigate('/admin/purchase-orders', { replace: true });
    },
  });

  const canAdd = !!newProductId && Number(newQty) > 0;

  return (
    <div className="page">
      <Link className="back-link" to="/admin/purchase-orders">
        ‹ Purchase Orders
      </Link>
      <PageHeader
        title={po?.poNumber ?? 'Purchase Order'}
        subtitle={po ? `${po.customerName ?? '—'} · ${po.status}` : undefined}
      />

      <QueryState isLoading={detail.isLoading} isError={detail.isError} error={detail.error}>
        <Panel title="Item codes">
          {removeLine.isError && <Banner tone="error">{errorMessage(removeLine.error)}</Banner>}
          <table className="data-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Product</th>
                <th className="num">Sets</th>
                <th className="num">Progress</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {detail.data?.jobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.itemCode ?? '—'}</td>
                  <td>{j.productName ?? '—'}</td>
                  <td className="num">{j.orderQuantity.toLocaleString()}</td>
                  <td className="num">{j.progressPct != null ? `${j.progressPct}%` : '—'}</td>
                  <td className="num">
                    <RemoveLineButton onConfirm={() => removeLine.mutate(j.id)} pending={removeLine.isPending} />
                  </td>
                </tr>
              ))}
              {!detail.data?.jobs.length && (
                <tr>
                  <td colSpan={5} className="muted-cell">
                    No item codes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="subhead">Add item code</div>
          {addLine.isError && <Banner tone="error">{errorMessage(addLine.error)}</Banner>}
          <div className="line-row">
            <SelectField
              label="Item code"
              value={newProductId}
              onChange={setNewProductId}
              options={productOptions}
              placeholder="Select item code"
            />
            <TextField label="Sets" type="number" value={newQty} onChange={setNewQty} placeholder="e.g. 5000" />
            <button
              className="btn-primary line-remove"
              disabled={!canAdd || addLine.isPending}
              onClick={() => addLine.mutate()}
            >
              {addLine.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </Panel>

        <Panel title="PO settings">
          {update.isError && <Banner tone="error">{errorMessage(update.error)}</Banner>}
          {update.isSuccess && <Banner tone="success">Saved.</Banner>}
          <div className="form-grid">
            <SelectField
              label="Status"
              value={status || (po?.status ?? '')}
              onChange={(v) => setStatus(v as PurchaseOrderStatus)}
              options={STATUS_OPTIONS}
            />
            <TextField
              label="Notes"
              value={notes ?? po?.notes ?? ''}
              onChange={(v) => setNotes(v)}
              placeholder="Optional notes"
            />
          </div>
          <button className="btn-primary" disabled={update.isPending} onClick={() => update.mutate()}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </Panel>

        <Panel title="Danger zone">
          {remove.isError && <Banner tone="error">{errorMessage(remove.error)}</Banner>}
          {!confirmDelete ? (
            <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete this purchase order
            </button>
          ) : (
            <div className="confirm">
              <span className="confirm-text">
                Delete this PO, its item codes, and every production, QC and dispatch record under them? This cannot be undone.
              </span>
              <button className="btn-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          )}
        </Panel>
      </QueryState>
    </div>
  );
}

function RemoveLineButton({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button className="btn-ghost sm" onClick={() => setConfirm(true)}>
        Remove
      </button>
    );
  }
  return (
    <span className="confirm">
      <button className="btn-danger sm" disabled={pending} onClick={onConfirm}>
        {pending ? '…' : 'Yes'}
      </button>
      <button className="btn-ghost sm" onClick={() => setConfirm(false)}>
        No
      </button>
    </span>
  );
}
