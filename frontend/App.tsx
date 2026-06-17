import {
  DarkTheme as NavDark,
  DefaultTheme as NavLight,
  NavigationContainer,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { asyncStoragePersister, queryClient } from '@/api/queryClient';
import { RootNavigator } from '@/navigation/RootNavigator';
import { linking } from '@/navigation/linking';
import { registerCacheClear, restoreSession } from '@/services/session';
import { useThemeStore } from '@/store/themeStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

// Bridge our design tokens into a React Navigation theme (header/background colors).
function useNavTheme(): NavTheme {
  const { colors, isDark } = useTheme();
  const base = isDark ? NavDark : NavLight;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };
}

function NavigationRoot() {
  const navTheme = useNavTheme();
  const { isDark } = useTheme();
  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    // Clear server cache on logout, restore the persisted theme, then auto-login.
    registerCacheClear(() => queryClient.clear());
    void hydrateTheme();
    void restoreSession();
  }, [hydrateTheme]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: asyncStoragePersister }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <NavigationRoot />
          </ThemeProvider>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
