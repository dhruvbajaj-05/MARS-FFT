import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { useTheme } from '@/theme/ThemeProvider';
import { CreateQCReportScreen } from '@/screens/qc/CreateQCReportScreen';
import { MouldingQCScreen } from '@/screens/qc/MouldingQCScreen';
import { QCImageGalleryScreen } from '@/screens/qc/QCImageGalleryScreen';
import { QCReportDetailScreen } from '@/screens/qc/QCReportDetailScreen';
import { QCReportsListScreen } from '@/screens/qc/QCReportsListScreen';
import type { QCStackParamList } from '@/screens/qc/navTypes';

const Stack = createNativeStackNavigator<QCStackParamList>();

// The Moulding department's QC tab. Rooted on the active-order QC screen (the order comes
// from the Entry tab) — no standalone Company → Product → Order module anymore (req #1).
export function QCNavigator() {
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
      <Stack.Screen name="MouldingQC" component={MouldingQCScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CreateQCReport" component={CreateQCReportScreen} options={{ title: 'New Report' }} />
      <Stack.Screen name="QCReportsList" component={QCReportsListScreen} options={{ title: 'Reports' }} />
      <Stack.Screen name="QCReportDetail" component={QCReportDetailScreen} options={{ title: 'Report' }} />
      <Stack.Screen name="QCImageGallery" component={QCImageGalleryScreen} options={{ title: 'Gallery' }} />
    </Stack.Navigator>
  );
}
