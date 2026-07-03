import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { CustomerHomeScreen } from '@/screens/customer/CustomerHomeScreen';
import { CustomerProductScreen } from '@/screens/customer/CustomerProductScreen';
import { CustomerOrderScreen } from '@/screens/customer/CustomerOrderScreen';
import { useTheme } from '@/theme/ThemeProvider';

// Drill-down stack for the customer portal: Products → Product → Order dashboard.
export type CustomerStackParamList = {
  CustomerHome: undefined;
  CustomerProduct: { productId: string; productName: string };
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
        name="CustomerProduct"
        component={CustomerProductScreen}
        options={({ route }) => ({ title: route.params.productName, headerBackTitle: 'Home' })}
      />
      <Stack.Screen
        name="CustomerOrder"
        component={CustomerOrderScreen}
        options={({ route }) => ({ title: route.params.orderCode, headerBackTitle: 'Back' })}
      />
    </Stack.Navigator>
  );
}
