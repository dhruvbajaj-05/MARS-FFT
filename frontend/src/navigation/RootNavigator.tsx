import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { useAuthStatus, useCurrentUser } from '@/hooks/useAuth';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { SplashScreen } from '@/screens/auth/SplashScreen';
import { ComingSoon } from '@/screens/shared/ComingSoon';
import { isEngineer, ROLES, type Role } from '@/types/roles';
import { AdminNavigator } from './AdminNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { EngineerNavigator } from './EngineerNavigator';

const Stack = createNativeStackNavigator();

// Safe fallback for an unrecognized role (never expose another role's screens).
function UnsupportedRoleScreen() {
  return <ComingSoon title="Unsupported role" />;
}

// Resolve the navigator for a role. Engineers (all four) share one navigator.
function navigatorForRole(role: Role): React.ComponentType {
  if (role === ROLES.ADMIN) return AdminNavigator;
  if (role === ROLES.CUSTOMER) return CustomerNavigator;
  if (isEngineer(role)) return EngineerNavigator;
  return UnsupportedRoleScreen;
}

// Top-level switch. RBAC enforcement starts here: only the navigator for the
// authenticated role is ever mounted, so unauthorized screens are not registered.
export function RootNavigator() {
  const status = useAuthStatus();
  const user = useCurrentUser();

  if (status === 'loading') return <SplashScreen />;

  if (status !== 'authed' || !user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  const RoleNavigator = navigatorForRole(user.role);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Root" component={RoleNavigator} />
    </Stack.Navigator>
  );
}
