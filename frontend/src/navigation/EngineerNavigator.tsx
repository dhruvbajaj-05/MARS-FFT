import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { departmentForRole } from '@/features/engineer/department';
import { MouldingSessionProvider } from '@/features/moulding/MouldingSessionContext';
import { useCurrentUser } from '@/hooks/useAuth';
import { EngineerDashboardScreen } from '@/screens/engineer/EngineerDashboardScreen';
import { EntryScreen } from '@/screens/engineer/EntryScreen';
import { MyRecordsScreen } from '@/screens/engineer/MyRecordsScreen';
import { StoreScreen } from '@/screens/engineer/StoreScreen';
import { SettingsScreen } from '@/screens/shared/SettingsScreen';
import { AppTabBar } from './AppTabBar';
import { QCNavigator } from './QCNavigator';
import { useTabScreenOptions } from './tabOptions';

const Tab = createBottomTabNavigator();

// Shared engineer shell for all four departments. Each tab resolves the active
// department from the user's role (see features/engineer/department.ts):
//   Entry  → the department's submission form (production / assembly / QC / dispatch)
//   Store  → Component Store (moulding, assembly) or Finished Goods (QC, dispatch)
//   Records→ the engineer's own submissions
// The QC tab is part of the Moulding department only (req #1) — each department owns its
// own QC. The MouldingSessionProvider shares the active order between Entry and QC (req #2).
export function EngineerNavigator() {
  const options = useTabScreenOptions();
  const user = useCurrentUser();
  const dept = user ? departmentForRole(user.role) : null;
  const isMoulding = dept?.key === 'moulding';

  return (
    <MouldingSessionProvider>
      <Tab.Navigator screenOptions={options} tabBar={(props) => <AppTabBar {...props} />}>
        <Tab.Screen name="EngineerDashboard" component={EngineerDashboardScreen} options={{ title: 'Dashboard' }} />
        <Tab.Screen name="CreateRecord" component={EntryScreen} options={{ title: 'Entry' }} />
        <Tab.Screen name="Store" component={StoreScreen} options={{ title: 'Store' }} />
        {isMoulding ? (
          <Tab.Screen name="QC" component={QCNavigator} options={{ title: 'QC', headerShown: false }} />
        ) : null}
        <Tab.Screen name="MyRecords" component={MyRecordsScreen} options={{ title: 'My Records' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </MouldingSessionProvider>
  );
}
