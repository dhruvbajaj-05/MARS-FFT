import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useColorScheme, View } from 'react-native';

import { useThemeStore } from '@/store/themeStore';
import { darkColors, lightColors, radius, spacing, typography, type ThemeColors } from './tokens';

interface Theme {
  colors: ThemeColors;
  isDark: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme();

  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';

  const theme = useMemo<Theme>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      spacing,
      radius,
      typography,
    }),
    [isDark],
  );

  return (
    <ThemeContext.Provider value={theme}>
      <View style={styles.fill}>
        {children}
        <ThemeFade isDark={isDark} background={theme.colors.background} />
      </View>
    </ThemeContext.Provider>
  );
}

// Smooth theme transition: on a light/dark switch, flash a full-screen layer in the NEW
// background colour and fade it out, so the palette eases in instead of snapping.
function ThemeFade({ isDark, background }: { isDark: boolean; background: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    opacity.setValue(1);
    Animated.timing(opacity, {
      toValue: 0,
      duration: 420,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isDark, opacity]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundColor: background, opacity }]}
    />
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
