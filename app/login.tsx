import React, { useEffect } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { router, useNavigation } from 'expo-router';
import { useAuth } from '../lib/auth';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Coffee } from 'lucide-react-native';

// --- Tailwind ---
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../tailwind.config.js';

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.extend?.colors ?? fullConfig.theme?.colors ?? {}) as Record<string, string>;
// --- End Tailwind ---

export default function LoginScreen() {
  const { signIn, user, isLoading } = useAuth();
  const navigation = useNavigation();

  // When user is signed in, navigate to the home screen
  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user]);

  // Update header
  useEffect(() => {
    navigation.setOptions({ 
      headerShown: false 
    });
  }, [navigation]);

  const handleSignIn = async () => {
    try {
      await signIn();
      // Navigation happens in the useEffect when user changes
    } catch (error) {
      console.error('Failed to sign in:', error);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-soft-off-white">
        <ActivityIndicator size="large" color={themeColors['cool-gray-green']} />
        <Text className="mt-4 text-cool-gray-green">Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-soft-off-white">
      <View className="flex-1 justify-center items-center px-8">
        <View className="w-40 h-40 mb-8 items-center justify-center">
          <Coffee size={100} color={themeColors['cool-gray-green']} />
        </View>
        
        <Text className="text-3xl font-bold text-center text-charcoal mb-2">
          The Good Cup
        </Text>
        
        <Text className="text-base text-center text-cool-gray-green mb-12 px-6">
          Track your coffee journey, improve your brews, and discover the perfect cup.
        </Text>
        
        <View className="w-full max-w-sm">
          <Button
            onPress={handleSignIn}
            className="bg-muted-sage-green py-3 rounded-lg"
            size="lg"
          >
            <Text className="text-base font-semibold text-charcoal">
              Sign In
            </Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
} 