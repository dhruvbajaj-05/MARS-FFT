import type { StatusTone } from '@/theme/tokens';
import type { QCSeverity, QCStatusValue } from '@/api/types';

// Shared visual metadata for the QC module so severity/status colours + labels stay
// consistent across every screen (dashboard, cards, detail, summary).

export const SEVERITY_META: Record<QCSeverity, { label: string; tone: StatusTone; icon: string }> = {
  minor: { label: 'Minor', tone: 'info', icon: '🟦' },
  major: { label: 'Major', tone: 'progress', icon: '🟧' },
  critical: { label: 'Critical', tone: 'danger', icon: '🟥' },
};

export const STATUS_META: Record<QCStatusValue, { label: string; tone: StatusTone }> = {
  open: { label: 'Open', tone: 'danger' },
  investigating: { label: 'Investigating', tone: 'progress' },
  resolved: { label: 'Resolved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
};

export const SEVERITY_ORDER: QCSeverity[] = ['minor', 'major', 'critical'];
export const STATUS_ORDER: QCStatusValue[] = ['open', 'investigating', 'resolved', 'rejected'];

// The default optional tags (spec §Optional Tags).
export const QC_TAGS = [
  'Machine Issue',
  'Material Issue',
  'Mould Issue',
  'Operator Issue',
  'Temperature',
  'Pressure',
  'Unknown',
];

export function shiftLabel(shift?: string | null): string {
  if (!shift) return '—';
  return `Shift ${shift}`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
