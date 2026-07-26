import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { CustomerHomeScreen } from '@/screens/customer/CustomerHomeScreen';
import { CustomerPOScreen } from '@/screens/customer/CustomerPOScreen';
import { CustomerOrderScreen } from '@/screens/customer/CustomerOrderScreen';
import { useTheme } from '@/theme/ThemeProvider';

// Drill-down stack for the customer portal (view-only): Purchase Orders → PO → Item Code
// dashboard (moulding / assembly / QC / dispatch).
export type CustomerStackParamList = {
  CustomerHome: undefined;
  CustomerPO: { purchaseOrderId: string; poNumber: string };
  CustomerOrder: { orderId: string; orderCode: string };
};

const Stack = createNativeStackNavigator<CustomerStackParamList>();

export function CustomerHomeNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="CustomerHome" component={CustomerHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="CustomerPO"
        component={CustomerPOScreen}
        options={({ route }) => ({ title: route.params.poNumber, headerBackTitle: 'Home' })}
      />
      <Stack.Screen
        name="CustomerOrder"
        component={CustomerOrderScreen}
        options={({ route }) => ({ title: route.params.orderCode, headerBackTitle: 'Back' })}
      />
    </Stack.Navigator>
  );
}
