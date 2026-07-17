import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { OrderTimelineScreen } from '@/screens/admin/OrderTimelineScreen';
import { PurchaseOrderDetailScreen } from '@/screens/admin/PurchaseOrderDetailScreen';
import { PurchaseOrdersScreen } from '@/screens/admin/PurchaseOrdersScreen';
import { useTheme } from '@/theme/ThemeProvider';

const Stack = createNativeStackNavigator();

// Admin Purchase Orders stack: PO list → PO detail (its item code jobs) → per-job timeline.
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
      <Stack.Screen name="PurchaseOrders" component={PurchaseOrdersScreen} options={{ title: 'Purchase Orders' }} />
      <Stack.Screen
        name="PurchaseOrderDetail"
        component={PurchaseOrderDetailScreen}
        options={({ route }: any) => ({ title: route.params?.poNumber ?? 'Purchase Order' })}
      />
      <Stack.Screen
        name="OrderTimeline"
        component={OrderTimelineScreen}
        options={({ route }: any) => ({
          title: route.params?.orderCode ?? 'Item Code Timeline',
        })}
      />
    </Stack.Navigator>
  );
}
