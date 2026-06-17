import type { StatusTone } from '@/theme/tokens';

// Map the backend's computed status strings (every department + customer/admin views)
// to a UI tone. Unknown strings fall back to neutral.
const MAP: Record<string, StatusTone> = {
  // Generic lifecycle
  Pending: 'pending',
  'In Progress': 'progress',
  Completed: 'success',
  // Moulding/Assembly stage labels (customer/admin overall)
  'In Moulding': 'progress',
  'In Assembly': 'progress',
  'In QC': 'progress',
  Dispatching: 'info',
  // QC verdicts
  Passed: 'success',
  Failed: 'danger',
  // Dispatch stages
  'Ready For Dispatch': 'info',
  'Partially Dispatched': 'progress',
  Dispatched: 'success',
  // Reporting
  Delayed: 'danger',
};

export function statusTone(status: string): StatusTone {
  return MAP[status] ?? 'neutral';
}
