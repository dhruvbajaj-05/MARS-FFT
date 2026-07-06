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

// Inline edit panel for a single machine (name + category).
function MachineEditPanel({ machine, onClose }: { machine: Machine; onClose: () => void }) {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState(machine.name);
  const [category, setCategory] = useState<string | null>(machine.category);

  const save = useMutation({
    mutationFn: () =>
      masterApi.updateMachine(machine.id, { name: name.trim(), category: category as MachineCategory }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] });
      onClose();
    },
  });

  const error = save.error instanceof ApiError ? friendlyMessage(save.error) : null;

  return (
    <View style={{ marginTop: spacing(2) }}>
      {error ? <Banner tone="danger" message={error} /> : null}
      <FormField label="Machine name" value={name} onChangeText={setName} />
      <Select label="Category" value={category} options={CATEGORY_OPTIONS} onChange={(v) => setCategory(v)} />
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        <Button
          label="Save"
          loading={save.isPending}
          disabled={!name.trim() || !category}
          onPress={() => save.mutate()}
          style={{ flex: 1 }}
        />
        <Button label="Cancel" variant="secondary" disabled={save.isPending} onPress={onClose} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

// Admin → Machine Master. Add / edit / delete machines in two categories. Moulding
// engineers only select these in the production form (they cannot manage them).
export function MachinesScreen() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>('injection');
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: queryKeys.machines({}),
    queryFn: () => masterApi.listMachines({}),
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
  const remove = useMutation({
    mutationFn: (m: Machine) => masterApi.deleteMachine(m.id),
    onSuccess: () => {
      setConfirmId(null);
      invalidate();
    },
  });

  const error = create.error instanceof ApiError ? friendlyMessage(create.error) : null;
  const deleteError = remove.error instanceof ApiError ? friendlyMessage(remove.error) : null;

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
      {deleteError ? <Banner tone="danger" message={deleteError} /> : null}
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
                    <View style={{ flex: 1, paddingRight: spacing(2) }}>
                      <AppText weight="600">{m.name}</AppText>
                      <AppText variant="caption" tone="muted">
                        {m.category === 'injection' ? 'Injection Molding' : 'Blow Molding'}
                      </AppText>
                    </View>
                    {editingId !== m.id && confirmId !== m.id ? (
                      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                        <Button
                          label="Edit"
                          variant="secondary"
                          onPress={() => {
                            setConfirmId(null);
                            setEditingId(m.id);
                          }}
                        />
                        <Button
                          label="Delete"
                          variant="danger"
                          onPress={() => {
                            setEditingId(null);
                            setConfirmId(m.id);
                          }}
                        />
                      </View>
                    ) : null}
                  </View>

                  {editingId === m.id ? <MachineEditPanel machine={m} onClose={() => setEditingId(null)} /> : null}

                  {confirmId === m.id ? (
                    <View style={{ marginTop: spacing(2) }}>
                      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
                        Delete &quot;{m.name}&quot;? This cannot be undone. Existing production records keep
                        their machine number.
                      </AppText>
                      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                        <Button
                          label="Confirm delete"
                          variant="danger"
                          loading={remove.isPending}
                          onPress={() => remove.mutate(m)}
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
