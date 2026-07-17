import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { AdminDashboardScreen } from '@/screens/admin/AdminDashboardScreen';
import { SettingsScreen } from '@/screens/shared/SettingsScreen';
import { AdminFactoryNavigator } from './AdminFactoryNavigator';
import { AdminMasterNavigator } from './AdminMasterNavigator';
import { AdminOrdersNavigator } from './AdminOrdersNavigator';
import { AdminQCNavigator } from './AdminQCNavigator';
import { AppTabBar } from './AppTabBar';
import { useTabScreenOptions } from './tabOptions';

const Tab = createBottomTabNavigator();

// Admin tab shell. 5 tabs:
//   Dashboard — redesigned command center overview
//   Factory   — production records for all departments
//   Orders    — create + manage + timeline (nested stack)
//   Master    — customers / products / machines / users (nested stack)
//   Settings  — app settings
export function AdminNavigator() {
  const options = useTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={options} tabBar={(props) => <AppTabBar {...props} />}>
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="AdminFactory"
        component={AdminFactoryNavigator}
        options={{ title: 'Factory', headerShown: false }}
      />
      <Tab.Screen
        name="AdminOrders"
        component={AdminOrdersNavigator}
        options={{ title: 'POs', headerShown: false }}
      />
      <Tab.Screen
        name="AdminQC"
        component={AdminQCNavigator}
        options={{ title: 'QC', headerShown: false }}
      />
      <Tab.Screen
        name="AdminMaster"
        component={AdminMasterNavigator}
        options={{ title: 'Master', headerShown: false }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}
