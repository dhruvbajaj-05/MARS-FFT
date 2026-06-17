import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { masterApi } from '@/api/endpoints/master';
import { queryKeys } from '@/api/queryKeys';
import type { Machine, MachineCategory } from '@/api/types';
import { AppText, Banner, Button, Card, FormField, QueryBoundary, Screen, Select } from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useTheme } from '@/theme/ThemeProvider';

const CATEGORY_OPTIONS = [
  { label: 'Injection Molding', value: 'injection' },
  { label: 'Blow Molding', value: 'blow' },
];

// Admin → Machine Master. Add / edit / archive machines in two categories. Moulding
// engineers only select these in the production form (they cannot manage them).
export function MachinesScreen() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>('injection');
  const [ok, setOk] = useState<string | null>(null);

  const params = { includeArchived: true };
  const list = useQuery({
    queryKey: queryKeys.machines(params),
    queryFn: () => masterApi.listMachines(params),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['machines'] });

  const create = useMutation({
    mutationFn: () => masterApi.createMachine({ name: name.trim(), category: category as MachineCategory }),
    onSuccess: (m) => {
      setOk(`Machine "${m.name}" added.`);
      setName('');
      invalidate();
    },
  });
  const archive = useMutation({
    mutationFn: (m: Machine) => masterApi.archiveMachine(m.id, m.status === 'Active'),
    onSuccess: invalidate,
  });

  const error = create.error instanceof ApiError ? friendlyMessage(create.error) : null;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} />}>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Machine Master
      </AppText>

      <Card style={{ marginBottom: spacing(4) }}>
        {ok ? <Banner tone="success" message={ok} /> : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <FormField label="Machine name" value={name} onChangeText={setName} placeholder="e.g. IMM-12" />
        <Select label="Category" value={category} options={CATEGORY_OPTIONS} onChange={(v) => setCategory(v)} />
        <Button
          label="Add Machine"
          loading={create.isPending}
          disabled={!name.trim() || !category}
          onPress={() => {
            setOk(null);
            create.mutate();
          }}
        />
      </Card>

      <AppText variant="h3" style={{ marginBottom: spacing(2) }}>
        Machines
      </AppText>
      <QueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error}
        data={list.data}
        onRetry={list.refetch}
      >
        {(machines) =>
          machines.length === 0 ? (
            <AppText tone="muted">No machines yet.</AppText>
          ) : (
            <View style={{ gap: spacing(2) }}>
              {machines.map((m) => (
                <Card key={m.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <AppText weight="600">
                        {m.name}
                        {m.status === 'Archived' ? '  (Archived)' : ''}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        {m.category === 'injection' ? 'Injection Molding' : 'Blow Molding'}
                      </AppText>
                    </View>
                    <Button
                      label={m.status === 'Active' ? 'Archive' : 'Restore'}
                      variant="secondary"
                      loading={archive.isPending}
                      onPress={() => archive.mutate(m)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
