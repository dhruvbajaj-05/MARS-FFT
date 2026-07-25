import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import type { QCDepartment } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CreateQCReportScreen } from '@/screens/qc/CreateQCReportScreen';
import { DepartmentQCScreen } from '@/screens/qc/DepartmentQCScreen';
import { QCImageGalleryScreen } from '@/screens/qc/QCImageGalleryScreen';
import { QCReportDetailScreen } from '@/screens/qc/QCReportDetailScreen';
import { QCReportsListScreen } from '@/screens/qc/QCReportsListScreen';
import type { QCStackParamList } from '@/screens/qc/navTypes';

const Stack = createNativeStackNavigator<QCStackParamList>();

// A department's QC stack (Moulding QC or Assembly QC), rooted on that department's QC list.
// Reused by the engineer shell (read-only for moulding/assembly engineers) and by the QC
// Engineer shell (full author). Capabilities are resolved per-role inside the screens.
function QCDepartmentStack({ department }: { department: QCDepartment }) {
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
      <Stack.Screen name="DepartmentQC" options={{ headerShown: false }}>
        {() => <DepartmentQCScreen department={department} />}
      </Stack.Screen>
      <Stack.Screen name="CreateQCReport" component={CreateQCReportScreen} options={{ title: 'New Report' }} />
      <Stack.Screen name="QCReportsList" component={QCReportsListScreen} options={{ title: 'Reports' }} />
      <Stack.Screen name="QCReportDetail" component={QCReportDetailScreen} options={{ title: 'Report' }} />
      <Stack.Screen name="QCImageGallery" component={QCImageGalleryScreen} options={{ title: 'Gallery' }} />
    </Stack.Navigator>
  );
}

export function MouldingQCNavigator() {
  return <QCDepartmentStack department="moulding" />;
}
export function AssemblyQCNavigator() {
  return <QCDepartmentStack department="assembly" />;
}

// Back-compat default export = the Moulding QC stack (the engineer shell's QC tab).
export function QCNavigator() {
  return <MouldingQCNavigator />;
}
