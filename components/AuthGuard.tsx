import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { Text } from './ui/text';

// --- Tailwind ---
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../tailwind.config.js';

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.extend?.colors ?? fullConfig.theme?.colors ?? {}) as Record<string, string>;
// --- End Tailwind ---

/**
 * A component that guards routes requiring authentication
 * If the user is not authenticated, redirects to the login page
 * If loading, shows a loading indicator
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      // Not authenticated, redirect to login
      router.replace('/login');
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-soft-off-white">
        <ActivityIndicator size="large" color={themeColors['cool-gray-green']} />
        <Text className="mt-4 text-cool-gray-green">Checking authentication...</Text>
      </View>
    );
  }

  if (!user) {
    // Return null while redirecting
    return null;
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
} 