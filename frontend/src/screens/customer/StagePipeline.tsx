import React from 'react';
import { View } from 'react-native';

import type { CustomerStageReached } from '@/api/types';
import { AppText } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

const STAGES: { key: keyof CustomerStageReached; label: string; icon: string }[] = [
  { key: 'moulding', label: 'Mould', icon: '🧱' },
  { key: 'assembly', label: 'Assembly', icon: '🔧' },
  { key: 'qc', label: 'QC', icon: '🔍' },
  { key: 'dispatch', label: 'Dispatch', icon: '🚚' },
];

// Compact 4-stage pipeline (Moulding → Assembly → QC → Dispatch) showing how far a PO or
// item code has progressed. A connector line fills between reached stages. View-only.
export function StagePipeline({ reached }: { reached: CustomerStageReached }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing(3) }}>
      {STAGES.map((s, i) => {
        const on = reached[s.key];
        const prev = STAGES[i - 1];
        const prevOn = prev ? reached[prev.key] : true;
        return (
          <React.Fragment key={s.key}>
            {i > 0 ? (
              <View
                style={{
                  flex: 1,
                  height: 2,
                  marginTop: 16,
                  backgroundColor: on || prevOn ? colors.status.success.fg : colors.border,
                  opacity: on || prevOn ? 0.7 : 1,
                }}
              />
            ) : null}
            <View style={{ alignItems: 'center', width: 52 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: on ? colors.status.success.bg : colors.surfaceAlt,
                  borderWidth: 1.5,
                  borderColor: on ? colors.status.success.fg : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: on ? 1 : 0.55,
                }}
              >
                <AppText style={{ fontSize: 15 }}>{s.icon}</AppText>
              </View>
              <AppText
                variant="caption"
                weight={on ? '700' : '500'}
                style={{ color: on ? colors.text : colors.textMuted, marginTop: 4, fontSize: 10 }}
              >
                {s.label}
              </AppText>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}
