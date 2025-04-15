import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, TextInput, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
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
  const { signIn, signUp, user, isLoading: authIsLoading } = useAuth();
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user]);

  useEffect(() => {
    navigation.setOptions({ 
      headerShown: false 
    });
  }, [navigation]);

  const handleAuthAction = async () => {
    if (!email || !password || (isSignUpMode && !name)) {
      setError('Please fill in all required fields.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (isSignUpMode) {
        await signUp({ email, password, name });
        setSuccessMessage('Registration successful! Please sign in.');
        setIsSignUpMode(false);
        setEmail('');
        setPassword('');
        setName('');
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      console.error(`Failed to ${isSignUpMode ? 'sign up' : 'sign in'}:`, err);
      setError(err.message || `Failed to ${isSignUpMode ? 'sign up' : 'sign in'}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  if (authIsLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-soft-off-white">
        <ActivityIndicator size="large" color={themeColors['cool-gray-green']} />
        <Text className="mt-4 text-cool-gray-green">Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-soft-off-white">
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView 
          contentContainerClassName="flex-grow justify-center items-center"
          className="flex-1 px-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-40 h-40 mb-8 items-center justify-center">
            <Coffee size={100} color={themeColors['cool-gray-green']} />
          </View>
          
          <Text className="text-3xl font-bold text-center text-charcoal mb-2">
            {isSignUpMode ? 'Create Account' : 'The Good Cup'}
          </Text>
          
          <Text className="text-base text-center text-cool-gray-green mb-12 px-6">
            {isSignUpMode ? 'Join us to track your coffee journey.' : 'Track your coffee journey, improve your brews, and discover the perfect cup.'}
          </Text>
          
          <View className="w-full max-w-sm space-y-4 mb-4">
            {isSignUpMode && (
              <TextInput
                className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base text-charcoal placeholder:text-cool-gray-green focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green"
                placeholder="Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
              />
            )}

            <TextInput
              className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base text-charcoal placeholder:text-cool-gray-green focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <TextInput
              className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base text-charcoal placeholder:text-cool-gray-green focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={isSignUpMode ? 'new-password' : 'password'}
            />

            {error && (
               <Text className="text-red-500 text-sm text-center">{error}</Text>
            )}
            {successMessage && (
               <Text className="text-green-600 text-sm text-center">{successMessage}</Text>
            )}

            <Button
              onPress={handleAuthAction}
              disabled={isLoading}
              className="bg-muted-sage-green py-3 rounded-lg"
              size="lg"
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={themeColors['charcoal']} />
              ) : (
                <Text className="text-base font-semibold text-charcoal">
                  {isSignUpMode ? 'Sign Up' : 'Sign In'}
                </Text>
              )}
            </Button>

            <TouchableOpacity onPress={() => {
              setIsSignUpMode(!isSignUpMode);
              setError(null);
              setSuccessMessage(null);
            }} className="pt-4 pb-2">
              <Text className="text-center text-cool-gray-green underline">
                {isSignUpMode ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
} 