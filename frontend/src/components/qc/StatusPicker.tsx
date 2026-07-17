import React from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/premium';
import { AppText } from '@/components/Text';
import type { QCStatusValue } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { STATUS_META, STATUS_ORDER } from './qcMeta';

// The QC status control: Open / Closed chips. Tapping one selects it — used both to
// display and to change a case's status.
export function StatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: QCStatusValue;
  onChange?: (v: QCStatusValue) => void;
  disabled?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
      {STATUS_ORDER.map((s) => {
        const meta = STATUS_META[s];
        const tone = colors.status[meta.tone];
        const active = value === s;
        return (
          <PressableScale key={s} onPress={disabled ? undefined : () => onChange?.(s)}>
            <View
              style={{
                paddingVertical: spacing(2),
                paddingHorizontal: spacing(3),
                borderRadius: radius.pill,
                backgroundColor: active ? tone.bg : colors.surfaceAlt,
                borderWidth: 1.5,
                borderColor: active ? tone.fg : 'transparent',
                opacity: disabled && !active ? 0.5 : 1,
              }}
            >
              <AppText variant="caption" weight="700" style={{ color: active ? tone.fg : colors.textMuted }}>
                {meta.label}
              </AppText>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
