import { config } from '@/config/env';

// The backend stores media URLs that may be relative (e.g. "/uploads/qc-reports/x.jpg").
// Resolve them against the API origin so <img> tags load. Absolute URLs pass through.
export function mediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${config.apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
}
