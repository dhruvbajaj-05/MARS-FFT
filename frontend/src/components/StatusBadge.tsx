import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { statusTone } from '@/utils/statusTone';
import { AppText } from './Text';

// Colored pill conveying a backend status string (Pending/Completed/Passed/...).
export function StatusBadge({ status }: { status: string }) {
  const { colors, radius } = useTheme();
  const tone = colors.status[statusTone(status)];

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderRadius: radius.pill }]}>
      <AppText variant="caption" style={{ color: tone.fg }} weight="600">
        {status}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
});
