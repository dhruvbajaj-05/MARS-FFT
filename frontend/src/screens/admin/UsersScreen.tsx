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

// Admin → Create Users (engineers by role, or customer-portal users tied to a customer).
export function UsersScreen() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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

  const error = create.error instanceof ApiError ? friendlyMessage(create.error) : null;
  const customerOptions: SelectOption[] = (customers.data?.data ?? []).map((c) => ({
    label: c.name,
    value: c.id,
  }));

  const needsCustomer = role === ROLES.CUSTOMER;
  const canSubmit =
    name.trim() && email.trim() && password.length >= 6 && role && (!needsCustomer || customerId);

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
          label="Password (min 6 chars)"
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
              {d.data.map((u) => (
                <Card key={u.id}>
                  <AppText weight="600">{u.name}</AppText>
                  <AppText variant="caption" tone="muted">
                    {u.email} · {ROLE_LABELS[u.role]}
                  </AppText>
                </Card>
              ))}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
