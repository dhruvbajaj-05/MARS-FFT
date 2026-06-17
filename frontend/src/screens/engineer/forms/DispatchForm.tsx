import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { View } from 'react-native';

import { dispatchApi } from '@/api/endpoints/dispatch';
import { storeApi } from '@/api/endpoints/store';
import { queryKeys } from '@/api/queryKeys';
import { AppText, Banner, Button, Card, FormField, Screen, Select } from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useCustomerProduct } from '@/screens/engineer/useCustomerProduct';
import { useTheme } from '@/theme/ThemeProvider';

const todayISO = () => new Date().toISOString().slice(0, 10);

// Dispatch Engineer → Dispatch from Finished Goods. The backend validates the packed
// quantity against finished-goods on hand and deducts it (stock-OUT).
export function DispatchForm() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const cp = useCustomerProduct();

  const [dispatchDate, setDispatchDate] = useState(todayISO());
  const [packed, setPacked] = useState('');
  const [cartons, setCartons] = useState('');
  const [transporter, setTransporter] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [lr, setLr] = useState('');
  const [invoice, setInvoice] = useState('');
  const [remarks, setRemarks] = useState('');
  const [ok, setOk] = useState<string | null>(null);

  const balance = useQuery({
    queryKey: queryKeys.store.finishedGoodsAvailability(cp.customerId ?? '', cp.productId ?? ''),
    queryFn: () => storeApi.finishedGoodsAvailability(cp.customerId!, cp.productId!),
    enabled: !!cp.customerId && !!cp.productId,
  });

  const submit = useMutation({
    mutationFn: () =>
      dispatchApi.submit({
        customerId: cp.customerId!,
        productId: cp.productId!,
        dispatchDate: new Date(dispatchDate).toISOString(),
        packedQuantity: Number(packed),
        cartonCount: Number(cartons),
        transporterName: transporter.trim(),
        vehicleNumber: vehicle.trim(),
        lrNumber: lr.trim(),
        invoiceNumber: invoice.trim(),
        dispatchRemarks: remarks.trim() || undefined,
      }),
    onSuccess: (res) => {
      setOk(`Dispatched ${res.record.packedQuantity}. Finished goods remaining: ${res.finishedGoods.quantityOnHand}.`);
      setPacked('');
      setCartons('');
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['packing-dispatch', 'mine'] });
      balance.refetch();
    },
  });

  const error = submit.error instanceof ApiError ? friendlyMessage(submit.error) : null;

  const nums = [packed, cartons].map(Number);
  const canSubmit =
    cp.customerId &&
    cp.productId &&
    dispatchDate.trim() &&
    transporter.trim() &&
    vehicle.trim() &&
    lr.trim() &&
    invoice.trim() &&
    nums.every((n) => Number.isFinite(n) && n >= 0);

  return (
    <Screen scroll>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Dispatch
      </AppText>

      <Card>
        {ok ? <Banner tone="success" message={ok} /> : null}
        {error ? <Banner tone="danger" message={error} /> : null}

        <Select label="Customer" value={cp.customerId} options={cp.customerOptions} onChange={cp.selectCustomer} />
        <Select
          label="Product"
          value={cp.productId}
          options={cp.productOptions}
          onChange={(v) => cp.setProductId(v)}
          placeholder={cp.customerId ? 'Select a product' : 'Select a customer first'}
        />

        {cp.productId && balance.data ? (
          <View style={{ marginBottom: spacing(3), flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" tone="muted">
              Finished goods available
            </AppText>
            <AppText weight="600">{balance.data.quantityOnHand}</AppText>
          </View>
        ) : null}

        <FormField label="Dispatch date (YYYY-MM-DD)" value={dispatchDate} onChangeText={setDispatchDate} autoCapitalize="none" />
        <FormField label="Dispatch / packed quantity" value={packed} onChangeText={setPacked} keyboardType="number-pad" placeholder="e.g. 1000" />
        <FormField label="Carton count" value={cartons} onChangeText={setCartons} keyboardType="number-pad" placeholder="e.g. 50" />
        <FormField label="Transporter" value={transporter} onChangeText={setTransporter} placeholder="e.g. Blue Dart" />
        <FormField label="Vehicle number" value={vehicle} onChangeText={setVehicle} placeholder="e.g. MH12AB1234" />
        <FormField label="LR number" value={lr} onChangeText={setLr} placeholder="e.g. LR-9981" />
        <FormField label="Invoice number" value={invoice} onChangeText={setInvoice} placeholder="e.g. INV-2026-001" />
        <FormField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />

        <Button
          label="Dispatch Finished Goods"
          loading={submit.isPending}
          disabled={!canSubmit}
          onPress={() => {
            setOk(null);
            submit.mutate();
          }}
        />
      </Card>
    </Screen>
  );
}
