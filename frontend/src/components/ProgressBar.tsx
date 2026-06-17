import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { clampPct } from '@/utils/format';
import { AppText } from './Text';

interface Props {
  pct: number;
  label?: string;
  tone?: 'primary' | 'success' | 'progress' | 'danger';
}

// Horizontal progress bar with an optional inline percentage label.
export function ProgressBar({ pct, label, tone = 'primary' }: Props) {
  const { colors, radius } = useTheme();
  const value = clampPct(pct);
  const fill = tone === 'primary' ? colors.primary : colors.status[tone].fg;

  return (
    <View>
      {label ? (
        <View style={styles.row}>
          <AppText variant="caption" tone="muted">
            {label}
          </AppText>
          <AppText variant="caption" weight="600">
            {value}%
          </AppText>
        </View>
      ) : null}
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]}>
        <View
          style={{ width: `${value}%`, backgroundColor: fill, height: 8, borderRadius: radius.pill }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  track: { height: 8, overflow: 'hidden' },
});
