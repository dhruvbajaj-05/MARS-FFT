import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'caption';
type Tone = 'default' | 'muted' | 'primary';

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: TextStyle['fontWeight'];
}

// Theme-aware text primitive used everywhere instead of raw <Text>.
export function AppText({ variant = 'body', tone = 'default', weight, style, ...rest }: Props) {
  const { colors, typography } = useTheme();
  const color =
    tone === 'muted' ? colors.textMuted : tone === 'primary' ? colors.primary : colors.text;

  return (
    <RNText
      style={[typography[variant], { color }, weight ? { fontWeight: weight } : null, style]}
      {...rest}
    />
  );
}
