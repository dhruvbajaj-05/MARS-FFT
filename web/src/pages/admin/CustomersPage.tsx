import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { masterApi } from '@/api/master';
import { errorMessage } from '@/api/client';
import type { Customer } from '@/api/types';
import { Banner, PageHeader, Panel, QueryState, TextField } from '@/components/ui';

// Admin → Customers (companies). Create form + live list with inline edit and a two-step
// delete. Mirrors the mobile CustomersScreen; a company with products/orders/history is
// protected by the backend (409 customer_in_use) and cannot be deleted.
export function CustomersPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: ['customers', { limit: 100 }],
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }),
  });

  const create = useMutation({
    mutationFn: () => masterApi.createCustomer(name.trim()),
    onSuccess: (c) => {
      setOk(`Customer "${c.name}" created.`);
      setName('');
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  return (
    <div className="page">
      <PageHeader title="Customers" subtitle="Create and manage the companies the factory produces for" />

      <Panel title="Create customer">
        {ok && <Banner tone="success">{ok}</Banner>}
        {create.isError && <Banner tone="error">{errorMessage(create.error)}</Banner>}
        <div className="form-grid">
          <TextField label="Customer / Company name" value={name} onChange={setName} placeholder="e.g. Wader" />
        </div>
        <button
          className="btn-primary"
          disabled={!name.trim() || create.isPending}
          onClick={() => {
            setOk(null);
            create.mutate();
          }}
        >
          {create.isPending ? 'Creating…' : 'Create customer'}
        </button>
      </Panel>

      <Panel title="Existing customers">
        <QueryState
          isLoading={customers.isLoading}
          isError={customers.isError}
          error={customers.error}
          isEmpty={!customers.data?.data.length}
        >
          <div className="list">
            {customers.data?.data.map((c) =>
              editingId === c.id ? (
                <CustomerEditRow key={c.id} customer={c} onDone={() => setEditingId(null)} />
              ) : (
                <div className="list-row" key={c.id}>
                  <div>
                    <div className="list-title">{c.name}</div>
                    <div className="list-sub">{c.id}</div>
                  </div>
                  <div className="row-actions">
                    <button className="btn-ghost" onClick={() => setEditingId(c.id)}>
                      Edit
                    </button>
                    <DeleteCustomerButton id={c.id} name={c.name} />
                  </div>
                </div>
              ),
            )}
          </div>
        </QueryState>
      </Panel>
    </div>
  );
}

// Inline edit form for one customer (name only).
function CustomerEditRow({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(customer.name);

  const save = useMutation({
    mutationFn: () => masterApi.updateCustomer(customer.id, name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onDone();
    },
  });

  return (
    <div className="list-row edit">
      <div className="edit-form">
        {save.isError && <Banner tone="error">{errorMessage(save.error)}</Banner>}
        <div className="form-grid">
          <TextField label="Customer / Company name" value={name} onChange={setName} />
        </div>
        <div className="row-actions">
          <button className="btn-primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
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
function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => masterApi.deleteCustomer(id),
    onSuccess: () => {
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['customers'] });
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
