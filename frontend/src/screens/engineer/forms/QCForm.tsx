import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';

import { qcApi } from '@/api/endpoints/qc';
import { AppText, Banner, Button, Card, FormField, Screen, Select } from '@/components';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useCustomerProduct } from '@/screens/engineer/useCustomerProduct';
import { useTheme } from '@/theme/ThemeProvider';

const todayISO = () => new Date().toISOString().slice(0, 10);

// QC Engineer → Submit Inspection. Approved units flow into the Finished Goods Store.
export function QCForm() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const cp = useCustomerProduct();

  const [inspectionDate, setInspectionDate] = useState(todayISO());
  const [inspectionType, setInspectionType] = useState('Final');
  const [sampleSize, setSampleSize] = useState('');
  const [accepted, setAccepted] = useState('');
  const [rejected, setRejected] = useState('');
  const [defectCount, setDefectCount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [ok, setOk] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      qcApi.submit({
        customerId: cp.customerId!,
        productId: cp.productId!,
        inspectionDate: new Date(inspectionDate).toISOString(),
        inspectionType: inspectionType.trim(),
        sampleSize: Number(sampleSize),
        acceptedQuantity: Number(accepted),
        rejectedQuantity: Number(rejected),
        defectCount: Number(defectCount || '0'),
        remarks: remarks.trim() || undefined,
      }),
    onSuccess: (res) => {
      setOk(
        `Inspection saved. ${res.record.acceptedQuantity} approved → Finished Goods (now ${res.finishedGoods.quantityOnHand}).`,
      );
      setSampleSize('');
      setAccepted('');
      setRejected('');
      setDefectCount('');
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['qc', 'mine'] });
    },
  });

  const error = submit.error instanceof ApiError ? friendlyMessage(submit.error) : null;

  const nums = [sampleSize, accepted, rejected].map(Number);
  const canSubmit =
    cp.customerId &&
    cp.productId &&
    inspectionDate.trim() &&
    inspectionType.trim() &&
    nums.every((n) => Number.isFinite(n) && n >= 0);

  return (
    <Screen scroll>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        QC Inspection
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

        <FormField label="Inspection date (YYYY-MM-DD)" value={inspectionDate} onChangeText={setInspectionDate} placeholder="2026-06-11" autoCapitalize="none" />
        <FormField label="Inspection type" value={inspectionType} onChangeText={setInspectionType} placeholder="e.g. Final" />
        <FormField label="Inspected quantity (sample size)" value={sampleSize} onChangeText={setSampleSize} keyboardType="number-pad" placeholder="e.g. 2000" />
        <FormField label="Approved quantity" value={accepted} onChangeText={setAccepted} keyboardType="number-pad" placeholder="e.g. 1995" />
        <FormField label="Rejected quantity" value={rejected} onChangeText={setRejected} keyboardType="number-pad" placeholder="e.g. 5" />
        <FormField label="Defect count" value={defectCount} onChangeText={setDefectCount} keyboardType="number-pad" placeholder="e.g. 5" />
        <FormField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />

        <Button
          label="Submit Inspection"
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
