import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { masterApi } from '@/api/master';
import { errorMessage } from '@/api/client';
import type { Product } from '@/api/types';
import { Banner, PageHeader, Panel, QueryState, SelectField, TextField } from '@/components/ui';

// Admin → Products. Each product belongs to a customer. Pick a customer to create products for
// them and view/edit/delete the existing ones. Mirrors the mobile ProductsScreen; a product
// with production history is protected by the backend (409 product_in_use).
export function ProductsPage() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [name, setName] = useState('');
  const [partName, setPartName] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: ['customers', { limit: 100 }],
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }),
  });

  const productParams = { customerId, limit: 200 };
  const products = useQuery({
    queryKey: ['products', productParams],
    queryFn: () => masterApi.listProducts(productParams),
    enabled: !!customerId,
  });

  const customerOptions = (customers.data?.data ?? []).map((c) => ({ label: c.name, value: c.id }));

  const create = useMutation({
    mutationFn: () =>
      masterApi.createProduct({
        customerId,
        name: name.trim(),
        itemCode: itemCode.trim(),
        ...(partName.trim() ? { partName: partName.trim() } : {}),
      }),
    onSuccess: (p) => {
      setOk(`Product "${p.name}"${p.itemCode ? ` (${p.itemCode})` : ''} created.`);
      setItemCode('');
      setName('');
      setPartName('');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const canCreate = !!customerId && !!name.trim() && !!itemCode.trim();

  return (
    <div className="page">
      <PageHeader title="Products" subtitle="Create and manage item codes for each customer" />

      <Panel title="Create product">
        {ok && <Banner tone="success">{ok}</Banner>}
        {create.isError && <Banner tone="error">{errorMessage(create.error)}</Banner>}
        <div className="form-grid">
          <SelectField
            label="Customer"
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder="Select a customer"
          />
          <TextField label="Item code" value={itemCode} onChange={setItemCode} placeholder="e.g. 37500" />
          <TextField label="Product name" value={name} onChange={setName} placeholder="e.g. City Truck" />
          <TextField label="Part name (optional)" value={partName} onChange={setPartName} placeholder="e.g. Cabin" />
        </div>
        <button
          className="btn-primary"
          disabled={!canCreate || create.isPending}
          onClick={() => {
            setOk(null);
            create.mutate();
          }}
        >
          {create.isPending ? 'Creating…' : 'Create product'}
        </button>
      </Panel>

      <Panel title={customerId ? 'Products for selected customer' : 'Existing products'}>
        {!customerId ? (
          <div className="state state-empty">Select a customer above to view their products.</div>
        ) : (
          <QueryState
            isLoading={products.isLoading}
            isError={products.isError}
            error={products.error}
            isEmpty={!products.data?.data.length}
          >
            <div className="list">
              {products.data?.data.map((p) =>
                editingId === p.id ? (
                  <ProductEditRow key={p.id} product={p} onDone={() => setEditingId(null)} />
                ) : (
                  <div className="list-row" key={p.id}>
                    <div>
                      <div className="list-title">
                        {p.itemCode ? `${p.itemCode} · ` : ''}
                        {p.name}
                      </div>
                      {p.partName && <div className="list-sub">{p.partName}</div>}
                    </div>
                    <div className="row-actions">
                      <button className="btn-ghost" onClick={() => setEditingId(p.id)}>
                        Edit
                      </button>
                      <DeleteProductButton id={p.id} name={p.name} />
                    </div>
                  </div>
                ),
              )}
            </div>
          </QueryState>
        )}
      </Panel>
    </div>
  );
}

// Inline edit form for one product (item code + name + part name).
function ProductEditRow({ product, onDone }: { product: Product; onDone: () => void }) {
  const qc = useQueryClient();
  const [itemCode, setItemCode] = useState(product.itemCode ?? '');
  const [name, setName] = useState(product.name);
  const [partName, setPartName] = useState(product.partName ?? '');

  const save = useMutation({
    mutationFn: () =>
      masterApi.updateProduct(product.id, {
        name: name.trim(),
        itemCode: itemCode.trim(),
        partName: partName.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      onDone();
    },
  });

  return (
    <div className="list-row edit">
      <div className="edit-form">
        {save.isError && <Banner tone="error">{errorMessage(save.error)}</Banner>}
        <div className="form-grid">
          <TextField label="Item code" value={itemCode} onChange={setItemCode} />
          <TextField label="Product name" value={name} onChange={setName} />
          <TextField label="Part name (optional)" value={partName} onChange={setPartName} />
        </div>
        <div className="row-actions">
          <button
            className="btn-primary"
            disabled={!name.trim() || !itemCode.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Delete with an inline confirm step. Surfaces the backend's protection message on failure.
function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => masterApi.deleteProduct(id),
    onSuccess: () => {
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  if (remove.isError) {
    return (
      <span className="confirm">
        <span className="confirm-text confirm-error">{errorMessage(remove.error)}</span>
        <button className="btn-ghost" onClick={() => remove.reset()}>
          Dismiss
        </button>
      </span>
    );
  }
  if (!confirm) {
    return (
      <button className="btn-danger" onClick={() => setConfirm(true)}>
        Delete
      </button>
    );
  }
  return (
    <span className="confirm">
      <span className="confirm-text">Delete {name}?</span>
      <button className="btn-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
        {remove.isPending ? '…' : 'Yes'}
      </button>
      <button className="btn-ghost" onClick={() => setConfirm(false)}>
        No
      </button>
    </span>
  );
}
