import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import React from 'react';
import { Text } from '../components/ui/text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center p-5 bg-soft-off-white">
        <Text className="text-2xl font-semibold text-charcoal mb-2">This screen doesn't exist.</Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-cool-gray-green font-medium">Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}
