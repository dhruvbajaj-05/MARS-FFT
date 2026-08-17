import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { masterApi } from '@/api/master';
import { usersApi, type CreateUserInput } from '@/api/users';
import { errorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { ROLE_LABELS, ROLES, type ManagedUser, type Role } from '@/api/types';
import { Banner, PageHeader, Panel, QueryState, SelectField, TextField } from '@/components/ui';

const ROLE_OPTIONS = [
  ROLES.MOULDING_ENGINEER,
  ROLES.ASSEMBLY_ENGINEER,
  ROLES.QC_ENGINEER,
  ROLES.PACKING_DISPATCH_ENGINEER,
  ROLES.CUSTOMER,
  ROLES.ADMIN,
].map((r) => ({ label: ROLE_LABELS[r], value: r }));

// Admin → Users. Create engineer/customer/admin accounts, and edit or delete existing ones.
// Customer-role users must be linked to a customer (same rule as mobile).
export function UsersPage() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: ['customers', { limit: 100 }],
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }),
  });
  const users = useQuery({
    queryKey: ['users', { limit: 100 }],
    queryFn: () => usersApi.list({ page: 1, limit: 100 }),
  });

  const customerOptions = (customers.data?.data ?? []).map((c) => ({ label: c.name, value: c.id }));
  const needsCustomer = role === ROLES.CUSTOMER;

  const create = useMutation({
    mutationFn: () => {
      const input: CreateUserInput = {
        name: name.trim(),
        email: email.trim(),
        password,
        role: role as Role,
        ...(needsCustomer && customerId ? { customerId } : {}),
      };
      return usersApi.create(input);
    },
    onSuccess: (u) => {
      setOk(`User "${u.name}" created.`);
      setName('');
      setEmail('');
      setPassword('');
      setRole('');
      setCustomerId('');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const canSubmit =
    name.trim() && email.trim() && password.length >= 8 && role && (!needsCustomer || customerId);

  return (
    <div className="page">
      <PageHeader title="Users" subtitle="Create and manage engineer, customer and admin accounts" />

      <Panel title="Create user">
        {ok && <Banner tone="success">{ok}</Banner>}
        {create.isError && <Banner tone="error">{errorMessage(create.error)}</Banner>}
        <div className="form-grid">
          <TextField label="Full name" value={name} onChange={setName} placeholder="e.g. Ravi Kumar" />
          <TextField label="Email" type="email" value={email} onChange={setEmail} placeholder="user@company.com" />
          <TextField
            label="Password (min 8 chars)"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />
          <SelectField label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} placeholder="Select role" />
          {needsCustomer && (
            <SelectField
              label="Customer (required)"
              value={customerId}
              onChange={setCustomerId}
              options={customerOptions}
              placeholder="Select customer"
            />
          )}
        </div>
        <button
          className="btn-primary"
          disabled={!canSubmit || create.isPending}
          onClick={() => {
            setOk(null);
            create.mutate();
          }}
        >
          {create.isPending ? 'Creating…' : 'Create user'}
        </button>
      </Panel>

      <Panel title="Existing users">
        <QueryState
          isLoading={users.isLoading}
          isError={users.isError}
          error={users.error}
          isEmpty={!users.data?.data.length}
        >
          <div className="list">
            {users.data?.data.map((u) =>
              editingId === u.id ? (
                <UserEditRow
                  key={u.id}
                  user={u}
                  customerOptions={customerOptions}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="list-row" key={u.id}>
                  <div>
                    <div className="list-title">{u.name}</div>
                    <div className="list-sub">
                      {u.email} · {ROLE_LABELS[u.role]}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button className="btn-ghost" onClick={() => setEditingId(u.id)}>
                      Edit
                    </button>
                    {currentUser?.id !== u.id && <DeleteUserButton id={u.id} name={u.name} />}
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

// Inline edit form for one user.
function UserEditRow({
  user,
  customerOptions,
  onDone,
}: {
  user: ManagedUser;
  customerOptions: { label: string; value: string }[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<string>(user.role);
  const [customerId, setCustomerId] = useState(user.customerId ?? '');
  const [password, setPassword] = useState('');

  const needsCustomer = role === ROLES.CUSTOMER;
  const save = useMutation({
    mutationFn: () =>
      usersApi.update(user.id, {
        name: name.trim(),
        email: email.trim(),
        role: role as Role,
        customerId: needsCustomer ? customerId || undefined : undefined,
        ...(password ? { password } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onDone();
    },
  });

  const canSave = name.trim() && email.trim() && role && (!needsCustomer || customerId) && (!password || password.length >= 8);

  return (
    <div className="list-row edit">
      <div className="edit-form">
        {save.isError && <Banner tone="error">{errorMessage(save.error)}</Banner>}
        <div className="form-grid">
          <TextField label="Full name" value={name} onChange={setName} />
          <TextField label="Email" type="email" value={email} onChange={setEmail} />
          <SelectField label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          {needsCustomer && (
            <SelectField
              label="Customer"
              value={customerId}
              onChange={setCustomerId}
              options={customerOptions}
              placeholder="Select customer"
            />
          )}
          <TextField
            label="New password (optional)"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Leave blank to keep"
          />
        </div>
        <div className="row-actions">
          <button className="btn-primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
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
function DeleteUserButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => usersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

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
