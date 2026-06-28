import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { OrderTimelineScreen } from '@/screens/admin/OrderTimelineScreen';
import { OrdersScreen } from '@/screens/admin/OrdersScreen';
import { useTheme } from '@/theme/ThemeProvider';

const Stack = createNativeStackNavigator();

export function AdminOrdersNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.primary,
      }}
    >
      <Stack.Screen name="OrdersList" component={OrdersScreen} options={{ title: 'Orders' }} />
      <Stack.Screen
        name="OrderTimeline"
        component={OrderTimelineScreen}
        options={({ route }: any) => ({
          title: route.params?.orderCode ?? 'Order Timeline',
        })}
      />
    </Stack.Navigator>
  );
}
