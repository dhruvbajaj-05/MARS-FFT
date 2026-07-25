import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { MouldingSessionProvider } from '@/features/moulding/MouldingSessionContext';
import { SettingsScreen } from '@/screens/shared/SettingsScreen';
import { AppTabBar } from './AppTabBar';
import { MouldingQCNavigator, AssemblyQCNavigator } from './QCNavigator';
import { useTabScreenOptions } from './tabOptions';

const Tab = createBottomTabNavigator();

// The QC Engineer's dedicated shell (decision: Defect QC only). Two department QC sections —
// Moulding QC + Assembly QC — with full author capabilities (create, edit, upload, open/close,
// archive). The finished-goods QC entry is intentionally not part of this shell (req #8).
// Wrapped in MouldingSessionProvider so the shared DepartmentQCScreen can read the (unused
// here) active-order session without special-casing.
export function QCEngineerNavigator() {
  const options = useTabScreenOptions();
  return (
    <MouldingSessionProvider>
      <Tab.Navigator screenOptions={options} tabBar={(props) => <AppTabBar {...props} />}>
        <Tab.Screen
          name="MouldingQC"
          component={MouldingQCNavigator}
          options={{ title: 'Moulding QC', headerShown: false }}
        />
        <Tab.Screen
          name="AssemblyQC"
          component={AssemblyQCNavigator}
          options={{ title: 'Assembly QC', headerShown: false }}
        />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </MouldingSessionProvider>
  );
}
