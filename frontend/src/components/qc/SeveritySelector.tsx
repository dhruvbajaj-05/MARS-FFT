import React from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/premium';
import { AppText } from '@/components/Text';
import type { QCSeverity } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { SEVERITY_META, SEVERITY_ORDER } from './qcMeta';

// Colour-coded severity radios (Minor / Major / Critical).
export function SeveritySelector({
  value,
  onChange,
}: {
  value: QCSeverity;
  onChange: (v: QCSeverity) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing(3) }}>
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(2) }}>
        Severity
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        {SEVERITY_ORDER.map((sev) => {
          const meta = SEVERITY_META[sev];
          const tone = colors.status[meta.tone];
          const active = value === sev;
          return (
            <PressableScale key={sev} onPress={() => onChange(sev)} style={{ flex: 1 }}>
              <View
                style={{
                  paddingVertical: spacing(3),
                  borderRadius: radius.md,
                  alignItems: 'center',
                  backgroundColor: active ? tone.bg : colors.surfaceAlt,
                  borderWidth: 2,
                  borderColor: active ? tone.fg : 'transparent',
                }}
              >
                <AppText
                  weight="700"
                  style={{ color: active ? tone.fg : colors.textMuted }}
                >
                  {meta.label}
                </AppText>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
