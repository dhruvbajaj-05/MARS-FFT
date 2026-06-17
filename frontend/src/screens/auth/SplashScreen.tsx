import React from 'react';
import { View } from 'react-native';

import { AppText, Loader, Screen } from '@/components';

// Shown while the session is being restored from secure storage on launch.
export function SplashScreen() {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <AppText variant="h1" style={{ textAlign: 'center', marginBottom: 12 }}>
          FFT Manufacturing
        </AppText>
        <Loader label="Restoring session…" />
      </View>
    </Screen>
  );
}
