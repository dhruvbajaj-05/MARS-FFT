import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './Text';
import { Button } from './Button';

// Centered loading spinner.
export function Loader({ label }: { label?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <AppText tone="muted" style={{ marginTop: spacing(2) }}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

// Empty-state placeholder.
export function EmptyState({ title, message }: { title: string; message?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={styles.center}>
      <AppText variant="h3">{title}</AppText>
      {message ? (
        <AppText tone="muted" style={{ marginTop: spacing(1), textAlign: 'center' }}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

// Error-state with a retry action.
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { spacing } = useTheme();
  return (
    <View style={styles.center}>
      <AppText variant="h3" tone="default">
        Something went wrong
      </AppText>
      <AppText tone="muted" style={{ marginTop: spacing(1), textAlign: 'center' }}>
        {message}
      </AppText>
      {onRetry ? (
        <Button label="Retry" onPress={onRetry} variant="secondary" style={{ marginTop: spacing(3) }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 160 },
});
