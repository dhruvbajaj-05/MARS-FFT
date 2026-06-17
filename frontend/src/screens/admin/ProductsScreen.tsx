import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { queryKeys } from '@/api/queryKeys';
import type { Customer, Paginated, Product } from '@/api/types';
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
import { useTheme } from '@/theme/ThemeProvider';

// Admin → Create Products (each product belongs to a customer).
export function ProductsScreen() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: queryKeys.customers({ page: 1, limit: 100 }),
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }) as Promise<Paginated<Customer>>,
  });

  const productParams = { customerId: customerId ?? undefined, limit: 100 };
  const products = useQuery({
    queryKey: queryKeys.products(productParams),
    queryFn: () => masterApi.listProducts(productParams) as Promise<Paginated<Product>>,
    enabled: !!customerId,
  });

  const create = useMutation({
    mutationFn: () => masterApi.createProduct({ customerId: customerId!, name: name.trim() }),
    onSuccess: (p) => {
      setOk(`Product "${p.name}" created`);
      setName('');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => masterApi.deleteProduct(id),
    onSuccess: (res) => {
      setOk(res.archived ? 'Product had history — archived (preserved).' : 'Product deleted.');
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => {
      setConfirmId(null);
      setDeleteError(err instanceof ApiError ? friendlyMessage(err) : 'Could not delete product');
    },
  });

  const error = create.error instanceof ApiError ? friendlyMessage(create.error) : null;
  const customerOptions: SelectOption[] = (customers.data?.data ?? []).map((c) => ({
    label: c.name,
    value: c.id,
  }));

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={products.isRefetching} onRefresh={products.refetch} />}
    >
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Products
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        {ok ? <Banner tone="success" message={ok} /> : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <Select
          label="Customer"
          value={customerId}
          options={customerOptions}
          onChange={(v) => setCustomerId(v)}
          placeholder="Select a customer"
          emptyHint="Create a customer first"
        />
        <FormField label="Product name" value={name} onChangeText={setName} placeholder="e.g. City Truck" />
        <Button
          label="Create Product"
          loading={create.isPending}
          disabled={!customerId || name.trim().length === 0}
          onPress={() => {
            setOk(null);
            create.mutate();
          }}
        />
      </Card>

      <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
        {customerId ? 'Products for selected customer' : 'Select a customer to view products'}
      </AppText>
      {customerId ? (
        <QueryBoundary
          isLoading={products.isLoading}
          isError={products.isError}
          error={products.error}
          data={products.data}
          onRetry={products.refetch}
        >
          {(d) =>
            d.data.length === 0 ? (
              <AppText tone="muted">No products yet for this customer.</AppText>
            ) : (
              <View style={{ gap: spacing(2) }}>
                {deleteError ? <Banner tone="danger" message={deleteError} /> : null}
                {d.data.map((p) => (
                  <Card key={p.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: spacing(2) }}>
                        <AppText weight="600">
                          {p.name}
                          {p.status === 'Archived' ? '  (Archived)' : ''}
                        </AppText>
                        <AppText variant="caption" tone="muted">
                          {p.id}
                        </AppText>
                      </View>
                      {confirmId !== p.id ? (
                        <Button
                          label="Delete"
                          variant="danger"
                          onPress={() => {
                            setOk(null);
                            setDeleteError(null);
                            setConfirmId(p.id);
                          }}
                        />
                      ) : null}
                    </View>
                    {confirmId === p.id ? (
                      <View style={{ marginTop: spacing(2) }}>
                        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
                          Delete &quot;{p.name}&quot;? Products with production history are archived
                          (kept for history), not removed — so OrderID tracking is never broken.
                        </AppText>
                        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                          <Button
                            label="Confirm"
                            variant="danger"
                            loading={remove.isPending}
                            onPress={() => remove.mutate(p.id)}
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
      ) : null}
    </Screen>
  );
}
