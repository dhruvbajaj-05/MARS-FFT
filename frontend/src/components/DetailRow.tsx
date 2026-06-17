import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './Text';

// Label/value row for detail screens (order details, summaries, shipment info).
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <AppText tone="muted" style={styles.label}>
        {label}
      </AppText>
      <View style={styles.value}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <AppText weight="600" style={{ textAlign: 'right' }}>
            {value}
          </AppText>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  label: { flexShrink: 0 },
  value: { flex: 1, alignItems: 'flex-end' },
});
