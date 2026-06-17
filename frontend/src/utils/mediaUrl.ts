import { config } from '@/config/env';

// Resolve a media URL for display (Gap #2 safety net). The backend returns absolute
// URLs when PUBLIC_BASE_URL is configured; if it returns a relative `/uploads/...`
// path instead, prefix it with the API origin so it loads on a device.
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${config.apiOrigin}${path}`;
}
