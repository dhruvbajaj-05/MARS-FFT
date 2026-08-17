import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '@/api/admin';
import { masterApi } from '@/api/master';
import { purchaseOrdersApi } from '@/api/purchaseOrders';
import type {
  AdminAssemblyRecord,
  AdminDispatchRecord,
  AdminMouldingRecord,
  AdminQCRecord,
  Paginated,
} from '@/api/types';

type AnyRecord = AdminMouldingRecord | AdminAssemblyRecord | AdminQCRecord | AdminDispatchRecord;
import { PageHeader, Panel, QueryState, SelectField } from '@/components/ui';

// Admin → Factory. The web parity of the mobile "Factory" (Production Records) screen:
// pick a department, then drill Customer → Purchase Order → Item Code to view that
// department's records. Deliberately item-code-first — the internal FFT order code is
// never shown; only PO numbers and item codes identify work.
type Dept = 'moulding' | 'assembly' | 'qc' | 'dispatch';
const DEPTS: { label: string; value: Dept }[] = [
  { label: 'Moulding', value: 'moulding' },
  { label: 'Assembly', value: 'assembly' },
  { label: 'QC', value: 'qc' },
  { label: 'Dispatch', value: 'dispatch' },
];

const n = (x: number) => x.toLocaleString();
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FactoryPage() {
  const [dept, setDept] = useState<Dept>('moulding');
  const [customerId, setCustomerId] = useState('');
  const [poId, setPoId] = useState('');
  // The selected item code IS an item-code production job; its id is the orderId records scope by.
  const [orderId, setOrderId] = useState('');
  // Optional further segregation of moulding records by mould name (populated from the records).
  const [moldName, setMoldName] = useState('');

  const customers = useQuery({
    queryKey: ['customers', { limit: 100 }],
    queryFn: () => masterApi.listCustomers({ page: 1, limit: 100 }),
  });
  const pos = useQuery({
    queryKey: ['purchase-orders', { customerId }],
    queryFn: () => purchaseOrdersApi.list({ customerId, limit: 100 }),
    enabled: !!customerId,
  });
  const po = useQuery({
    queryKey: ['purchase-order', poId],
    queryFn: () => purchaseOrdersApi.get(poId),
    enabled: !!poId,
  });

  const customerOptions = (customers.data?.data ?? []).map((c) => ({ label: c.name, value: c.id }));
  const poOptions = (pos.data?.data ?? []).map((p) => ({ label: p.poNumber ?? p.id, value: p.id }));
  const jobOptions = (po.data?.jobs ?? []).map((j) => ({
    label: j.itemCode ? (j.partName ? `${j.itemCode} · ${j.partName}` : j.itemCode) : j.productName ?? 'Item',
    value: j.id,
  }));

  const records = useQuery<Paginated<AnyRecord>>({
    queryKey: ['admin', 'records', dept, orderId],
    queryFn: () => {
      const params = { orderId, limit: 200 };
      return dept === 'moulding'
        ? adminApi.mouldingRecords(params)
        : dept === 'assembly'
          ? adminApi.assemblyRecords(params)
          : dept === 'qc'
            ? adminApi.qcRecords(params)
            : adminApi.dispatchRecords(params);
    },
    enabled: !!orderId,
  });

  // Distinct mould names within the selected item code's moulding records, for the Mould filter.
  const mouldRows = dept === 'moulding' ? ((records.data?.data ?? []) as AdminMouldingRecord[]) : [];
  const mouldNameOptions = Array.from(
    new Set(mouldRows.map((r) => r.moldName).filter(Boolean)),
  ).map((m) => ({ label: m, value: m }));
  const visibleMouldRows = moldName ? mouldRows.filter((r) => r.moldName === moldName) : mouldRows;

  const ready = !!orderId;

  return (
    <div className="page">
      <PageHeader
        title="Factory"
        subtitle="Pick a department, then drill Customer → Purchase Order → Item Code (→ Mould) to view its records"
      />

      {/* Department selector */}
      <div className="filter-row">
        {DEPTS.map((d) => (
          <button
            key={d.value}
            className={`chip${dept === d.value ? ' chip-active' : ''}`}
            onClick={() => {
              setDept(d.value);
              setMoldName('');
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <Panel title="Select item code">
        <div className="form-grid">
          <SelectField
            label="Customer"
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setPoId('');
              setOrderId('');
              setMoldName('');
            }}
            options={customerOptions}
            placeholder="Select a customer"
          />
          <SelectField
            label="Purchase Order"
            value={poId}
            onChange={(v) => {
              setPoId(v);
              setOrderId('');
              setMoldName('');
            }}
            options={poOptions}
            placeholder={customerId ? 'Select a purchase order' : 'Select a customer first'}
            disabled={!customerId}
          />
          <SelectField
            label="Item Code"
            value={orderId}
            onChange={(v) => {
              setOrderId(v);
              setMoldName('');
            }}
            options={jobOptions}
            placeholder={poId ? 'Select an item code' : 'Select a purchase order first'}
            disabled={!poId}
          />
          {dept === 'moulding' && (
            <SelectField
              label="Mould"
              value={moldName}
              onChange={setMoldName}
              options={mouldNameOptions}
              placeholder={
                !orderId
                  ? 'Select an item code first'
                  : mouldNameOptions.length
                    ? 'All moulds'
                    : 'No moulds yet'
              }
              disabled={!orderId || !mouldNameOptions.length}
            />
          )}
        </div>
      </Panel>

      <Panel title={`${DEPTS.find((d) => d.value === dept)!.label} records`}>
        {!ready ? (
          <div className="state state-empty">
            Select a customer, purchase order and item code to view records.
          </div>
        ) : (
          <QueryState
            isLoading={records.isLoading}
            isError={records.isError}
            error={records.error}
            isEmpty={dept === 'moulding' ? !visibleMouldRows.length : !records.data?.data.length}
          >
            {dept === 'moulding' && <MouldingTable rows={visibleMouldRows} />}
            {dept === 'assembly' && (
              <AssemblyTable rows={(records.data?.data ?? []) as AdminAssemblyRecord[]} />
            )}
            {dept === 'qc' && <QCTable rows={(records.data?.data ?? []) as AdminQCRecord[]} />}
            {dept === 'dispatch' && (
              <DispatchTable rows={(records.data?.data ?? []) as AdminDispatchRecord[]} />
            )}
          </QueryState>
        )}
      </Panel>
    </div>
  );
}

function MouldingTable({ rows }: { rows: AdminMouldingRecord[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Item Code</th>
          <th>Part</th>
          <th>Mould</th>
          <th>Machine</th>
          <th>Shift</th>
          <th className="num">Cavity</th>
          <th className="num">Shots</th>
          <th className="num">Rejected</th>
          <th className="num">Good Parts</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.itemCode ?? '—'}</td>
            <td>{r.partName}</td>
            <td>{r.moldName}</td>
            <td>{r.machineNumber}</td>
            <td>Shift {r.shift}</td>
            <td className="num">{r.cavity}</td>
            <td className="num">{n(r.shotsDone)}</td>
            <td className="num">{n(r.rejectedShots)}</td>
            <td className="num">{n(r.goodParts)}</td>
            <td>{shortDate(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AssemblyTable({ rows }: { rows: AdminAssemblyRecord[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Item Code</th>
          <th>Product</th>
          <th>Line</th>
          <th>Shift</th>
          <th className="num">Operators</th>
          <th className="num">Input</th>
          <th className="num">Assembled</th>
          <th className="num">Rejected</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.itemCode ?? '—'}</td>
            <td>{r.product ?? '—'}</td>
            <td>{r.assemblyLine}</td>
            <td>Shift {r.shift}</td>
            <td className="num">{r.operatorCount}</td>
            <td className="num">{n(r.inputQuantity)}</td>
            <td className="num">{n(r.assembledQuantity)}</td>
            <td className="num">{n(r.rejectedQuantity)}</td>
            <td>{shortDate(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QCTable({ rows }: { rows: AdminQCRecord[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Item Code</th>
          <th>Type</th>
          <th className="num">Sample</th>
          <th className="num">Accepted</th>
          <th className="num">Rejected</th>
          <th className="num">Pass Rate</th>
          <th>Defects</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pass = r.sampleSize > 0 ? Math.round((r.acceptedQuantity / r.sampleSize) * 100) : 0;
          return (
            <tr key={r.id}>
              <td>{r.itemCode ?? '—'}</td>
              <td>{r.inspectionType}</td>
              <td className="num">{n(r.sampleSize)}</td>
              <td className="num">{n(r.acceptedQuantity)}</td>
              <td className="num">{n(r.rejectedQuantity)}</td>
              <td className="num">{pass}%</td>
              <td>{r.defects.map((d) => `${d.defectType} (${d.quantity})`).join(', ') || '—'}</td>
              <td>{shortDate(r.inspectionDate)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DispatchTable({ rows }: { rows: AdminDispatchRecord[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Item Code</th>
          <th className="num">Packed</th>
          <th className="num">Cartons</th>
          <th>Transporter</th>
          <th>Vehicle</th>
          <th>LR</th>
          <th>Invoice</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.itemCode ?? '—'}</td>
            <td className="num">{n(r.packedQuantity)}</td>
            <td className="num">{r.cartonCount}</td>
            <td>{r.transporterName}</td>
            <td>{r.vehicleNumber}</td>
            <td>{r.lrNumber}</td>
            <td>{r.invoiceNumber}</td>
            <td>{shortDate(r.dispatchDate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
