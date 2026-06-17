import React from 'react';

import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/theme/ThemeProvider';
import type { StatusTone } from '@/theme/tokens';
import { Card } from './Card';
import { AppText } from './Text';
import { View } from 'react-native';

interface KPI {
  label: string;
  value: string | number;
  tone?: StatusTone;
}

// A single KPI tile.
export function KPIStat({ label, value, tone }: KPI) {
  const { colors } = useTheme();
  const accent = tone ? colors.status[tone].fg : colors.text;
  return (
    <Card>
      <AppText variant="h1" style={{ color: accent }}>
        {value}
      </AppText>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </Card>
  );
}

// Responsive grid of KPI tiles (2 cols phone → 3/4 cols tablet). Chunked into rows of
// `flex: 1` tiles so spacing never overflows the row width.
export function KPIGrid({ items }: { items: KPI[] }) {
  const { gridColumns } = useResponsive();
  const { spacing } = useTheme();
  const gap = spacing(3);

  const rows: KPI[][] = [];
  for (let i = 0; i < items.length; i += gridColumns) {
    rows.push(items.slice(i, i + gridColumns));
  }

  return (
    <View style={{ gap }}>
      {rows.map((row, idx) => (
        <View key={idx} style={{ flexDirection: 'row', gap }}>
          {row.map((item) => (
            <View key={item.label} style={{ flex: 1 }}>
              <KPIStat {...item} />
            </View>
          ))}
          {/* Pad the last row so tiles keep their column width. */}
          {row.length < gridColumns
            ? Array.from({ length: gridColumns - row.length }).map((_, i) => (
                <View key={`pad-${i}`} style={{ flex: 1 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}
