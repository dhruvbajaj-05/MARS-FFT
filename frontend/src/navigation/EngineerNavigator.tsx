import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { EngineerDashboardScreen } from '@/screens/engineer/EngineerDashboardScreen';
import { EntryScreen } from '@/screens/engineer/EntryScreen';
import { MyRecordsScreen } from '@/screens/engineer/MyRecordsScreen';
import { StoreScreen } from '@/screens/engineer/StoreScreen';
import { SettingsScreen } from '@/screens/shared/SettingsScreen';
import { useTabScreenOptions } from './tabOptions';

const Tab = createBottomTabNavigator();

// Shared engineer shell for all four departments. Each tab resolves the active
// department from the user's role (see features/engineer/department.ts):
//   Entry  → the department's submission form (production / assembly / QC / dispatch)
//   Store  → Component Store (moulding, assembly) or Finished Goods (QC, dispatch)
//   Records→ the engineer's own submissions
export function EngineerNavigator() {
  const options = useTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={options}>
      <Tab.Screen name="EngineerDashboard" component={EngineerDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="CreateRecord" component={EntryScreen} options={{ title: 'Entry' }} />
      <Tab.Screen name="Store" component={StoreScreen} options={{ title: 'Store' }} />
      <Tab.Screen name="MyRecords" component={MyRecordsScreen} options={{ title: 'My Records' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}
