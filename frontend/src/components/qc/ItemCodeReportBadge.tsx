import React from 'react';
import { View } from 'react-native';

import { AppText } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

// A small at-a-glance marker shown next to an item code so viewers can see WHERE QC reports
// live without opening every item code. Emphasises open cases (danger), falls back to a neutral
// "reports" pill when everything is closed, and a muted hint when the item code is clean.
export function ItemCodeReportBadge({
  reportCount,
  openCount,
}: {
  reportCount: number;
  openCount: number;
}) {
  const { colors, radius, spacing } = useTheme();

  if (!reportCount) {
    return (
      <AppText variant="caption" tone="muted">
        No QC reports
      </AppText>
    );
  }

  const tone = openCount > 0 ? colors.status.danger : colors.status.success;
  const label =
    openCount > 0
      ? `🔴 ${openCount} open · ${reportCount} report${reportCount === 1 ? '' : 's'}`
      : `${reportCount} report${reportCount === 1 ? '' : 's'}`;

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: tone.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing(2),
        paddingVertical: spacing(1),
      }}
    >
      <AppText variant="caption" weight="700" style={{ color: tone.fg }}>
        {label}
      </AppText>
    </View>
  );
}
