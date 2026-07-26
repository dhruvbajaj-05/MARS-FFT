import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { AdminQCPOScreen } from '@/screens/admin/AdminQCPOScreen';
import { AdminQCScreen } from '@/screens/admin/AdminQCScreen';
import { QCImageGalleryScreen } from '@/screens/qc/QCImageGalleryScreen';
import { QCReportDetailScreen } from '@/screens/qc/QCReportDetailScreen';
import { QCReportsListScreen } from '@/screens/qc/QCReportsListScreen';
import { useTheme } from '@/theme/ThemeProvider';

const Stack = createNativeStackNavigator();

// Admin's QC browser: list POs → pick a PO → choose Moulding / Assembly QC → item code →
// its reports → open one → view its gallery (req #6). List/detail/gallery screens are
// shared with the engineer stack (route names match QCStackParamList).
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
      <Stack.Screen name="AdminQCPO" component={AdminQCPOScreen} options={{ title: 'Purchase Order' }} />
      <Stack.Screen name="QCReportsList" component={QCReportsListScreen} options={{ title: 'QC Reports' }} />
      <Stack.Screen name="QCReportDetail" component={QCReportDetailScreen} options={{ title: 'Report' }} />
      <Stack.Screen name="QCImageGallery" component={QCImageGalleryScreen} options={{ title: 'Gallery' }} />
    </Stack.Navigator>
  );
}
