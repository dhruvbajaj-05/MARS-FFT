import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

import { useTheme } from '@/theme/ThemeProvider';

// Shared, theme-aware bottom-tab styling so every role navigator looks consistent.
export function useTabScreenOptions(): BottomTabNavigationOptions {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.surface },
    headerTitleStyle: { color: colors.text },
    headerTintColor: colors.text,
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
  };
}
