import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Image, Text as RNText } from 'react-native';

import { HapticTab } from '../../components/HapticTab';
import { IconSymbol } from '../../components/ui/IconSymbol';
import TabBarBackground from '../../components/ui/TabBarBackground';
import { Text } from '../../components/ui/text';
import { AuthGuard } from '../../components/AuthGuard';

// --- Tailwind ---
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config.js'; // Adjust path if necessary

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

export default function TabLayout() {
  return (
    <AuthGuard>
      <Tabs
        initialRouteName="index" // Start on the Beans tab
        screenOptions={{
          tabBarActiveTintColor: themeColors['cool-gray-green'], // Use theme color (darker green)
          tabBarInactiveTintColor: themeColors['pebble-gray'], // Use theme color
          headerShown: false, // We'll use the Stack header from the root layout
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground,
          tabBarStyle: Platform.select({
            ios: {
              position: 'absolute',
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
            },
            default: {
              backgroundColor: themeColors['soft-off-white'], // Use theme color
              borderTopColor: themeColors['pale-gray'], // Use theme color
            },
          }),
          tabBarLabel: ({ color, children }) => (
            <RNText style={{ color, fontSize: 12, marginBottom: 4 }}>
              {children}
            </RNText>
          ),
        }}>
        <Tabs.Screen
          name="index" // Corresponds to app/(tabs)/index.tsx
          options={{
            title: 'Beans',
            tabBarIcon: ({ color }: { color: string }) => (
              <Image
                source={require('../../assets/images/beans.png')}
                style={{ width: 52, height: 52, tintColor: color }}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
          }}
        />
        {/* Dynamic screens within tabs - hidden from the tab bar */}
        <Tabs.Screen 
          name="[beanId]/brew"
          options={{
            title: 'Add Brew',
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen 
          name="[beanId]/brews"
          options={{
            title: 'Brew History',
            href: null, // Hide from tab bar
          }}
        />
      </Tabs>
    </AuthGuard>
  );
} 