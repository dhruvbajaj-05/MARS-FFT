import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { CustomerDashboardScreen } from '@/screens/customer/CustomerDashboardScreen';
import { ComingSoon } from '@/screens/shared/ComingSoon';
import { SettingsScreen } from '@/screens/shared/SettingsScreen';
import { useTabScreenOptions } from './tabOptions';

const Tab = createBottomTabNavigator();

// Customer shell. Orders list/detail (with QC + dispatch summaries, progress and the
// photo gallery) are wired in the next pass; the dashboard is live.
export function CustomerNavigator() {
  const options = useTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={options}>
      <Tab.Screen name="CustomerDashboard" component={CustomerDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="CustomerOrders" options={{ title: 'Orders' }}>
        {() => <ComingSoon title="My Orders" />}
      </Tab.Screen>
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}
