// Small, dependency-free formatters shared across screens.

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Friendly relative "last updated" label (e.g. "Updated 5m ago"). Falls back to a
// short date once past a month.
export function relativeTime(value: string | null | undefined, prefix = 'Updated'): string {
  if (!value) return 'No activity yet';
  const d = new Date(value);
  const ms = Date.now() - d.getTime();
  if (!Number.isFinite(ms) || ms < 0) return `${prefix} just now`;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return `${prefix} just now`;
  if (mins < 60) return `${prefix} ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${prefix} ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${prefix} ${days}d ago`;
  return `${prefix} ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}
