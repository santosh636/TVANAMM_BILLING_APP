import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { IconSymbol } from '../../components/ui/IconSymbol';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
  }, []);

  return (
    <ThemeProvider value={theme}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Hides tab bar completely
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          ...(Platform.OS === 'ios' ? { tabBarItemStyle: { position: 'absolute' } } : {}),
        }}
      >
        {/* Primary Tabs */}
        <Tabs.Screen
          name="menu-editor"
          options={{
            title: 'Menu',
            tabBarIcon: ({ color }) => <IconSymbol name="list.bullet" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="sales-overview"
          options={{
            title: 'Sales',
            tabBarIcon: ({ color }) => <IconSymbol name="chart.bar" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="predictive-analysis"
          options={{
            title: 'Predictive',
            tabBarIcon: ({ color }) => <IconSymbol name="lightbulb.fill" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color }) => <IconSymbol name="square.grid.2x2.fill" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="admin-dashboard-billing"
          options={{
            title: 'Admin',
            tabBarIcon: ({ color }) => <IconSymbol name="briefcase.fill" size={24} color={color} />,
          }}
        />

        {/* Hidden Screens (navigate via router.push or router.replace) */}
        <Tabs.Screen
          name="new-bill"
          options={{
            title: 'New Bill',
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="billing-history"
          options={{
            title: 'Billing History',
            tabBarButton: () => null,
          }}
        />
      </Tabs>
    </ThemeProvider>
  );
}
