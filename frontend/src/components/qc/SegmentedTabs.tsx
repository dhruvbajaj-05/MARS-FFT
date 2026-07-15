import React from 'react';
import { View } from 'react-native';

import { PressableScale, shadow } from '@/components/premium';
import { AppText } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

// Large two-pill (or N-pill) segmented switcher used for the Moulding QC / Assembly QC
// top tabs. Dependency-free (no material-top-tabs), premium look, big touch targets.
export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.pill,
        padding: spacing(1),
        gap: spacing(1),
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1 }}>
            <View
              style={[
                {
                  paddingVertical: spacing(3),
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: spacing(2),
                  backgroundColor: active ? colors.primary : 'transparent',
                },
                active ? shadow('sm') : null,
              ]}
            >
              {o.icon ? <AppText style={{ fontSize: 16 }}>{o.icon}</AppText> : null}
              <AppText
                weight="700"
                style={{ color: active ? colors.primaryText : colors.textMuted, letterSpacing: 0.2 }}
              >
                {o.label}
              </AppText>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
