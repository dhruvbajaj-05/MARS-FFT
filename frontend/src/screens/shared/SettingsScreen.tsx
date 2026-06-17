import React from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, DetailRow, Screen } from '@/components';
import { useCurrentUser, useLogout } from '@/hooks/useAuth';
import { useThemeStore, type ThemeMode } from '@/store/themeStore';
import { useTheme } from '@/theme/ThemeProvider';
import { ROLE_LABELS } from '@/types/roles';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

// Shared profile + settings screen (theme switch, logout). Reachable from every role.
export function SettingsScreen() {
  const { spacing, colors, radius } = useTheme();
  const user = useCurrentUser();
  const logout = useLogout();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <Screen scroll>
      <AppText variant="h2" style={{ marginBottom: spacing(4) }}>
        Settings
      </AppText>

      {user ? (
        <Card style={{ marginBottom: spacing(4) }}>
          <DetailRow label="Name" value={user.name} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow label="Role" value={ROLE_LABELS[user.role]} />
        </Card>
      ) : null}

      <Card style={{ marginBottom: spacing(4) }}>
        <AppText variant="h3" style={{ marginBottom: spacing(3) }}>
          Appearance
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
          {MODES.map((m) => {
            const active = mode === m;
            return (
              <View key={m} style={{ flex: 1 }}>
                <View
                  style={{
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    paddingVertical: spacing(3),
                    alignItems: 'center',
                  }}
                  onTouchEnd={() => setMode(m)}
                >
                  <AppText
                    weight="600"
                    style={{ color: active ? colors.primaryText : colors.text, textTransform: 'capitalize' }}
                  >
                    {m}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <Button label="Log Out" variant="danger" loading={logout.isPending} onPress={() => logout.mutate()} />
    </Screen>
  );
}
