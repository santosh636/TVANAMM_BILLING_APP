// app/_layout.tsx

import { Stack } from 'expo-router';
import React from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <PaperProvider>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,    // turn off the header everywhere
          }}
        />
      </SafeAreaProvider>
    </PaperProvider>
  );
}
