import '../global.css'; // Import global CSS for NativeWind
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import React from 'react';
import 'react-native-reanimated';
import { LogBox, View } from 'react-native'; // Import LogBox and View
import { PortalHost } from '@rn-primitives/portal'; // Import PortalHost
import { AuthProvider } from '../lib/auth';

// Ignore the specific defaul tProps warning from Slider
LogBox.ignoreLogs([
  'Slider: Support for defaultProps will be removed',
]);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // const colorScheme = useColorScheme(); // Removed
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <View className="flex-1 bg-soft-off-white"> {/* Keep Tailwind classes */}
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </View>
      <PortalHost />
    </AuthProvider>
  );
}
