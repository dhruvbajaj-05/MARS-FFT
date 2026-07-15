import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { AdminQCScreen } from '@/screens/admin/AdminQCScreen';
import { QCImageGalleryScreen } from '@/screens/qc/QCImageGalleryScreen';
import { QCReportDetailScreen } from '@/screens/qc/QCReportDetailScreen';
import { useTheme } from '@/theme/ThemeProvider';

const Stack = createNativeStackNavigator();

// Admin's QC browser: list every defect report (filterable) → open one → view its gallery.
// No Moulding module required (req #6). Detail + gallery screens are shared with the
// engineer stack (route names match QCStackParamList).
export function AdminQCNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="AdminQCList" component={AdminQCScreen} options={{ headerShown: false }} />
      <Stack.Screen name="QCReportDetail" component={QCReportDetailScreen} options={{ title: 'Report' }} />
      <Stack.Screen name="QCImageGallery" component={QCImageGalleryScreen} options={{ title: 'Gallery' }} />
    </Stack.Navigator>
  );
}
