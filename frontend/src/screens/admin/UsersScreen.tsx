import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { usersApi, type CreateUserInput } from '@/api/endpoints/users';
import { queryKeys } from '@/api/queryKeys';
import type { Customer, ManagedUser, Paginated } from '@/api/types';
import {
  AppText,
  Banner,
  Button,
  Card,
  FormField,
  QueryBoundary,
  Screen,
  Select,
  type SelectOption,
} from '@/components';
import { useCurrentUser } from '@/hooks/useAuth';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { ROLE_LABELS, ROLES, type Role } from '@/types/roles';
import { useTheme } from '@/theme/ThemeProvider';

const ROLE_OPTIONS: SelectOption[] = [
  ROLES.MOULDING_ENGINEER,
  ROLES.ASSEMBLY_ENGINEER,
  ROLES.QC_ENGINEER,
  ROLES.PACKING_DISPATCH_ENGINEER,
  ROLES.CUSTOMER,
  ROLES.ADMIN,
].map((r) => ({ label: ROLE_LABELS[r], value: r }));

// Inline edit panel for a single user (name, email, role, customer, optional new password).
function UserEditPanel({
  user,
  customerOptions,
  onClose,
}: {
  user: ManagedUser;
  customerOptions: SelectOption[];
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role | null>(user.role);
  const [customerId, setCustomerId] = useState<string | null>(user.customerId);
  const [password, setPassword] = useState('');

  const save = useMutation({
    mutationFn: () =>
      usersApi.update(user.id, {
        name: name.trim(),
        email: email.trim(),
        role: role as Role,
        customerId: role === ROLES.CUSTOMER ? customerId ?? undefined : undefined,
        ...(password ? { password } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  const error = save.error instanceof ApiError ? friendlyMessage(save.error) : null;
  const needsCustomer = role === ROLES.CUSTOMER;
  const canSave =
    name.trim() && email.trim() && role && (!needsCustomer || customerId) && (!password || password.length >= 8);

  return (
    <View style={{ marginTop: spacing(2) }}>
      {error ? <Banner tone="danger" message={error} /> : null}
      <FormField label="Full name" value={name} onChangeText={setName} />
      <FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Select label="Role" value={role} options={ROLE_OPTIONS} onChange={(v) => setRole(v as Role)} />
      {needsCustomer ? (
        <Select
          label="Customer (required for customer users)"
          value={customerId}
          options={customerOptions}
          onChange={(v) => setCustomerId(v)}
          emptyHint="Create a customer first"
        />
      ) : null}
      <FormField
        label="New password (optional, min 8 chars)"
        value={password}
        onChangeText={setPassword}
        placeholder="Leave blank to keep current"
        secureTextEntry
      />
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        <Button label="Save" loading={save.isPending} disabled={!canSave} onPress={() => save.mutate()} style={{ flex: 1 }} />
        <Button label="Cancel" variant="secondary" disabled={save.isPending} onPress={onClose} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

// Admin → Create Users (engineers by role, or customer-portal users tied to a customer).
export function UsersScreen() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const currentUser = useCurrentUser();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: queryKeys.customers({ page: 1, limit: 100 }),
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }) as Promise<Paginated<Customer>>,
  });
  const users = useQuery({
    queryKey: queryKeys.users({ page: 1, limit: 100 }),
    queryFn: () => usersApi.list({ page: 1, limit: 100 }) as Promise<Paginated<ManagedUser>>,
  });

  const create = useMutation({
    mutationFn: () => {
      const input: CreateUserInput = {
        name: name.trim(),
        email: email.trim(),
        password,
        role: role as Role,
        ...(role === ROLES.CUSTOMER && customerId ? { customerId } : {}),
      };
      return usersApi.create(input);
    },
    onSuccess: (u) => {
      setOk(`User "${u.name}" created`);
      setName('');
      setEmail('');
      setPassword('');
      setRole(null);
      setCustomerId(null);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const error = create.error instanceof ApiError ? friendlyMessage(create.error) : null;
  const deleteError = remove.error instanceof ApiError ? friendlyMessage(remove.error) : null;
  const customerOptions: SelectOption[] = (customers.data?.data ?? []).map((c) => ({
    label: c.name,
    value: c.id,
  }));

  const needsCustomer = role === ROLES.CUSTOMER;
  const canSubmit =
    name.trim() && email.trim() && password.length >= 8 && role && (!needsCustomer || customerId);

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={users.isRefetching} onRefresh={users.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Users
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        {ok ? <Banner tone="success" message={ok} /> : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <FormField label="Full name" value={name} onChangeText={setName} placeholder="e.g. Ravi Kumar" />
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="user@company.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField
          label="Password (min 8 chars)"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
        />
        <Select label="Role" value={role} options={ROLE_OPTIONS} onChange={(v) => setRole(v as Role)} />
        {needsCustomer ? (
          <Select
            label="Customer (required for customer users)"
            value={customerId}
            options={customerOptions}
            onChange={(v) => setCustomerId(v)}
            emptyHint="Create a customer first"
          />
        ) : null}
        <Button
          label="Create User"
          loading={create.isPending}
          disabled={!canSubmit}
          onPress={() => {
            setOk(null);
            create.mutate();
          }}
        />
      </Card>

      <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
        Existing users
      </AppText>
      {deleteError ? <Banner tone="danger" message={deleteError} /> : null}
      <QueryBoundary
        isLoading={users.isLoading}
        isError={users.isError}
        error={users.error}
        data={users.data}
        onRetry={users.refetch}
      >
        {(d) =>
          d.data.length === 0 ? (
            <AppText tone="muted">No users yet.</AppText>
          ) : (
            <View style={{ gap: spacing(2) }}>
              {d.data.map((u) => {
                const isSelf = currentUser?.id === u.id;
                return (
                  <Card key={u.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: spacing(2) }}>
                        <AppText weight="600">{u.name}</AppText>
                        <AppText variant="caption" tone="muted">
                          {u.email} · {ROLE_LABELS[u.role]}
                        </AppText>
                      </View>
                      {editingId !== u.id && confirmId !== u.id ? (
                        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                          <Button
                            label="Edit"
                            variant="secondary"
                            onPress={() => {
                              setConfirmId(null);
                              setEditingId(u.id);
                            }}
                          />
                          {!isSelf ? (
                            <Button
                              label="Delete"
                              variant="danger"
                              onPress={() => {
                                setEditingId(null);
                                setConfirmId(u.id);
                              }}
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    {editingId === u.id ? (
                      <UserEditPanel user={u} customerOptions={customerOptions} onClose={() => setEditingId(null)} />
                    ) : null}

                    {confirmId === u.id ? (
                      <View style={{ marginTop: spacing(2) }}>
                        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
                          Delete &quot;{u.name}&quot;? This permanently removes the account and cannot be undone.
                        </AppText>
                        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                          <Button
                            label="Confirm delete"
                            variant="danger"
                            loading={remove.isPending}
                            onPress={() => remove.mutate(u.id)}
                            style={{ flex: 1 }}
                          />
                          <Button
                            label="Cancel"
                            variant="secondary"
                            disabled={remove.isPending}
                            onPress={() => setConfirmId(null)}
                            style={{ flex: 1 }}
                          />
                        </View>
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
