import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { CustomerHomeNavigator } from './CustomerHomeNavigator';
import { SettingsScreen } from '@/screens/shared/SettingsScreen';
import { useTabScreenOptions } from './tabOptions';

const Tab = createBottomTabNavigator();

// Customer portal shell — a product-first drill-down (Products → Product → Order
// dashboard) plus Settings. Orders live inside their product, so there is no separate
// flat Orders tab.
export function CustomerNavigator() {
  const options = useTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={options}>
      <Tab.Screen name="CustomerHome" component={CustomerHomeNavigator} options={{ title: 'Home' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}
