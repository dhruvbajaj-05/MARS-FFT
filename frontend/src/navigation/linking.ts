import type { LinkingOptions } from '@react-navigation/native';

// Deep-linking config — scaffolding for FUTURE push notifications / production &
// dispatch alerts (Phase 10 spec: prepare architecture, do not implement). When push
// is added, notification payloads carry a `screen`/`params` pair that maps here so a
// tap routes the user straight to the relevant order/record.
export const linking: LinkingOptions<Record<string, object | undefined>> = {
  prefixes: ['fftmfg://', 'https://app.fft.local'],
  // Screen → path mappings are added alongside each role navigator's routes when push
  // deep-linking is implemented (see services/notifications.ts).
  config: { screens: {} },
};
