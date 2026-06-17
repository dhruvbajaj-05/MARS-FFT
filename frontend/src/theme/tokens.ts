// Design tokens — an industrial, high-contrast palette suited to factory-floor use.
// Two themes (light/dark) expose the SAME token keys so components stay theme-agnostic.

export type StatusTone = 'pending' | 'progress' | 'success' | 'danger' | 'info' | 'neutral';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  // Status tones (badges, progress bars).
  status: Record<StatusTone, { bg: string; fg: string }>;
}

const status = {
  light: {
    pending: { bg: '#E2E8F0', fg: '#475569' },
    progress: { bg: '#FEF3C7', fg: '#92400E' },
    success: { bg: '#DCFCE7', fg: '#166534' },
    danger: { bg: '#FEE2E2', fg: '#991B1B' },
    info: { bg: '#DBEAFE', fg: '#1E40AF' },
    neutral: { bg: '#F1F5F9', fg: '#334155' },
  },
  dark: {
    pending: { bg: '#334155', fg: '#CBD5E1' },
    progress: { bg: '#78350F', fg: '#FDE68A' },
    success: { bg: '#14532D', fg: '#BBF7D0' },
    danger: { bg: '#7F1D1D', fg: '#FECACA' },
    info: { bg: '#1E3A8A', fg: '#BFDBFE' },
    neutral: { bg: '#1E293B', fg: '#CBD5E1' },
  },
};

export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  primary: '#1D4ED8',
  primaryText: '#FFFFFF',
  status: status.light,
};

export const darkColors: ThemeColors = {
  background: '#0F172A',
  surface: '#1E293B',
  surfaceAlt: '#172033',
  border: '#334155',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  primary: '#3B82F6',
  primaryText: '#0B1220',
  status: status.dark,
};

export const spacing = (n: number) => n * 4;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

export const typography = {
  h1: { fontSize: 24, fontWeight: '700' as const },
  h2: { fontSize: 20, fontWeight: '700' as const },
  h3: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
};
