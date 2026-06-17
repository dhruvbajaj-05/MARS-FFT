import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { AdminDashboardScreen } from '@/screens/admin/AdminDashboardScreen';
import { OrdersScreen } from '@/screens/admin/OrdersScreen';
import { SettingsScreen } from '@/screens/shared/SettingsScreen';
import { AdminMasterNavigator } from './AdminMasterNavigator';
import { useTabScreenOptions } from './tabOptions';

const Tab = createBottomTabNavigator();

// Admin tab shell. Master (Customers/Products/Users) is a nested stack; Orders is a
// direct create+list screen. Analytics is intentionally omitted for the MVP.
export function AdminNavigator() {
  const options = useTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={options}>
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="AdminMaster"
        component={AdminMasterNavigator}
        options={{ title: 'Master', headerShown: false }}
      />
      <Tab.Screen name="AdminOrders" component={OrdersScreen} options={{ title: 'Orders' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}
