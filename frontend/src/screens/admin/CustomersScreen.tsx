import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { queryKeys } from '@/api/queryKeys';
import type { Customer, Paginated } from '@/api/types';
import { AppText, Banner, Button, Card, FormField, QueryBoundary, Screen } from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useTheme } from '@/theme/ThemeProvider';

// Admin → Create Customers. Create form + live list (proves rows land in MongoDB).
export function CustomersScreen() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  // Two-step delete confirmation (inline, web-safe — Alert.alert does not render on web).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const params = { page: 1, limit: 100 };
  const list = useQuery({
    queryKey: queryKeys.customers(params),
    queryFn: () => masterApi.listCustomers(params) as Promise<Paginated<Customer>>,
  });

  const create = useMutation({
    mutationFn: () => masterApi.createCustomer(name.trim()),
    onSuccess: (c) => {
      setOk(`Customer "${c.name}" created`);
      setName('');
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => masterApi.deleteCustomer(id),
    onSuccess: () => {
      setOk('Customer deleted');
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => {
      setConfirmId(null);
      setDeleteError(err instanceof ApiError ? friendlyMessage(err) : 'Could not delete customer');
    },
  });

  const error = create.error instanceof ApiError ? friendlyMessage(create.error) : null;

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Customers
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        {ok ? <Banner tone="success" message={ok} /> : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <FormField label="Customer / Company name" value={name} onChangeText={setName} placeholder="e.g. Wader" />
        <Button
          label="Create Customer"
          loading={create.isPending}
          disabled={name.trim().length === 0}
          onPress={() => {
            setOk(null);
            create.mutate();
          }}
        />
      </Card>

      <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
        Existing customers
      </AppText>
      {deleteError ? <Banner tone="danger" message={deleteError} /> : null}
      <QueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error}
        data={list.data}
        onRetry={list.refetch}
      >
        {(d) =>
          d.data.length === 0 ? (
            <AppText tone="muted">No customers yet.</AppText>
          ) : (
            <View style={{ gap: spacing(2) }}>
              {d.data.map((c) => (
                <Card key={c.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: spacing(2) }}>
                      <AppText weight="600">{c.name}</AppText>
                      <AppText variant="caption" tone="muted">
                        {c.id}
                      </AppText>
                    </View>
                    {confirmId !== c.id ? (
                      <Button
                        label="Delete"
                        variant="danger"
                        onPress={() => {
                          setOk(null);
                          setDeleteError(null);
                          setConfirmId(c.id);
                        }}
                      />
                    ) : null}
                  </View>

                  {confirmId === c.id ? (
                    <View style={{ marginTop: spacing(2) }}>
                      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
                        Delete &quot;{c.name}&quot;? This cannot be undone. Customers with products,
                        orders or production history are protected and cannot be deleted.
                      </AppText>
                      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                        <Button
                          label="Confirm delete"
                          variant="danger"
                          loading={remove.isPending}
                          onPress={() => remove.mutate(c.id)}
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
              ))}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
