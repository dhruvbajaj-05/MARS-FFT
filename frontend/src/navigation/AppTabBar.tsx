import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

// Emoji glyphs keyed by route name across every role navigator. Emoji keeps us dependency
// free (no vector-icon package) while giving each tab a clear, always-visible icon.
const ICONS: Record<string, string> = {
  // Engineer
  EngineerDashboard: '🏠',
  CreateRecord: '📝',
  Store: '📦',
  QC: '🔍',
  MyRecords: '📋',
  // Admin
  AdminDashboard: '🏭',
  AdminFactory: '🔧',
  AdminOrders: '🧾',
  AdminQC: '🔍',
  AdminMaster: '🗂️',
  // Customer
  CustomerHome: '🏠',
  // Shared
  Settings: '⚙️',
};

// One responsive bottom bar used by every module (req #7). Equal-flex items (no overlap /
// smudging on any width), large touch targets, consistent height, safe-area padding, and
// icon + label always visible.
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        backgroundColor: colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        paddingTop: spacing(1.5),
        paddingHorizontal: spacing(1),
        paddingBottom: Math.max(insets.bottom, spacing(2)),
      }}
    >
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
        const focused = state.index === index;
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;
        const icon = ICONS[route.name] ?? '•';
        const color = focused ? colors.primary : colors.textMuted;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={onLongPress}
            android_ripple={{ color: colors.surfaceAlt, borderless: true }}
            style={{
              flex: 1,
              minHeight: 52,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: spacing(1),
            }}
          >
            <AppText style={{ fontSize: 22, marginBottom: 2, opacity: focused ? 1 : 0.75 }}>{icon}</AppText>
            <AppText
              numberOfLines={1}
              style={{ fontSize: 11, fontWeight: focused ? '700' : '500', color, textAlign: 'center' }}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
