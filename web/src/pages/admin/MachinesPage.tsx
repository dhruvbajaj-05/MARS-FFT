import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { masterApi } from '@/api/master';
import { errorMessage } from '@/api/client';
import type { Machine, MachineCategory } from '@/api/types';
import { Banner, PageHeader, Panel, QueryState, SelectField, TextField } from '@/components/ui';

const CATEGORY_OPTIONS = [
  { label: 'Injection Molding', value: 'injection' },
  { label: 'Blow Molding', value: 'blow' },
];
const categoryLabel = (c: MachineCategory) => (c === 'injection' ? 'Injection Molding' : 'Blow Molding');

// Admin → Machine Master. Add / edit / delete machines in two categories. Engineers only
// select these in the production form (they cannot manage them). Mirrors mobile MachinesScreen.
export function MachinesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('injection');
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const machines = useQuery({
    queryKey: ['machines', {}],
    queryFn: () => masterApi.listMachines({}),
  });

  const create = useMutation({
    mutationFn: () => masterApi.createMachine({ name: name.trim(), category: category as MachineCategory }),
    onSuccess: (m) => {
      setOk(`Machine "${m.name}" added.`);
      setName('');
      qc.invalidateQueries({ queryKey: ['machines'] });
    },
  });

  return (
    <div className="page">
      <PageHeader title="Machines" subtitle="Injection & blow molding machine master" />

      <Panel title="Add machine">
        {ok && <Banner tone="success">{ok}</Banner>}
        {create.isError && <Banner tone="error">{errorMessage(create.error)}</Banner>}
        <div className="form-grid">
          <TextField label="Machine name" value={name} onChange={setName} placeholder="e.g. IMM-12" />
          <SelectField label="Category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        </div>
        <button
          className="btn-primary"
          disabled={!name.trim() || !category || create.isPending}
          onClick={() => {
            setOk(null);
            create.mutate();
          }}
        >
          {create.isPending ? 'Adding…' : 'Add machine'}
        </button>
      </Panel>

      <Panel title="Machines">
        <QueryState
          isLoading={machines.isLoading}
          isError={machines.isError}
          error={machines.error}
          isEmpty={!machines.data?.length}
        >
          <div className="list">
            {machines.data?.map((m) =>
              editingId === m.id ? (
                <MachineEditRow key={m.id} machine={m} onDone={() => setEditingId(null)} />
              ) : (
                <div className="list-row" key={m.id}>
                  <div>
                    <div className="list-title">{m.name}</div>
                    <div className="list-sub">{categoryLabel(m.category)}</div>
                  </div>
                  <div className="row-actions">
                    <button className="btn-ghost" onClick={() => setEditingId(m.id)}>
                      Edit
                    </button>
                    <DeleteMachineButton id={m.id} name={m.name} />
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

// Inline edit form for one machine (name + category).
function MachineEditRow({ machine, onDone }: { machine: Machine; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(machine.name);
  const [category, setCategory] = useState<string>(machine.category);

  const save = useMutation({
    mutationFn: () => masterApi.updateMachine(machine.id, { name: name.trim(), category: category as MachineCategory }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] });
      onDone();
    },
  });

  return (
    <div className="list-row edit">
      <div className="edit-form">
        {save.isError && <Banner tone="error">{errorMessage(save.error)}</Banner>}
        <div className="form-grid">
          <TextField label="Machine name" value={name} onChange={setName} />
          <SelectField label="Category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        </div>
        <div className="row-actions">
          <button className="btn-primary" disabled={!name.trim() || !category || save.isPending} onClick={() => save.mutate()}>
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

// Delete with an inline confirm step.
function DeleteMachineButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => masterApi.deleteMachine(id),
    onSuccess: () => {
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['machines'] });
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
