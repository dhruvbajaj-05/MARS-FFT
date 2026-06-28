import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { FactoryMonitorScreen } from '@/screens/admin/FactoryMonitorScreen';
import { useTheme } from '@/theme/ThemeProvider';

const Stack = createNativeStackNavigator();

export function AdminFactoryNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.primary,
      }}
    >
      <Stack.Screen
        name="FactoryMonitor"
        component={FactoryMonitorScreen}
        options={{ title: 'Production Records' }}
      />
    </Stack.Navigator>
  );
}
