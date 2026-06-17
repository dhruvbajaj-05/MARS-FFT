import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { CustomersScreen } from '@/screens/admin/CustomersScreen';
import { MachinesScreen } from '@/screens/admin/MachinesScreen';
import { MasterHubScreen } from '@/screens/admin/MasterHubScreen';
import { ProductsScreen } from '@/screens/admin/ProductsScreen';
import { UsersScreen } from '@/screens/admin/UsersScreen';
import { useTheme } from '@/theme/ThemeProvider';

const Stack = createNativeStackNavigator();

// Stack inside the admin "Master" tab: hub → Customers / Products / Users.
export function AdminMasterNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.primary,
      }}
    >
      <Stack.Screen name="MasterHub" component={MasterHubScreen} options={{ title: 'Master Data' }} />
      <Stack.Screen name="Customers" component={CustomersScreen} options={{ title: 'Customers' }} />
      <Stack.Screen name="Products" component={ProductsScreen} options={{ title: 'Products' }} />
      <Stack.Screen name="Machines" component={MachinesScreen} options={{ title: 'Machines' }} />
      <Stack.Screen name="Users" component={UsersScreen} options={{ title: 'Users' }} />
    </Stack.Navigator>
  );
}
