import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define the shape of our auth context
type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (details: { email: string; password: string; name?: string }) => Promise<void>;
  token: string | null;
};

// User type (customize this based on your needs)
type User = {
  id: string;
  email?: string;
  name?: string;
};

// Storage keys
const AUTH_TOKEN_KEY = '@GoodCup:authToken';
const USER_DATA_KEY = '@GoodCup:userData';

// API URL configuration - Hardcode a fallback base URL as well
// Default to Vercel deployment URL if available, otherwise use localhost
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://good-cup-api.vercel.app';
console.log('API URL configured as:', API_URL);

// Helper to ensure no double slashes in URL
const buildApiUrl = (endpoint: string) => {
  const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${path}`;
};

// Create the context with a default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signIn: async (email, password) => {},
  signOut: async () => {},
  signUp: async (details) => {},
  token: null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved authentication state on app start
  useEffect(() => {
    const loadSavedAuth = async () => {
      try {
        console.log('Attempting to load auth state from AsyncStorage');
        const savedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        const savedUserData = await AsyncStorage.getItem(USER_DATA_KEY);
        
        console.log('Token retrieved from storage:', savedToken ? 'Yes (exists)' : 'No');
        console.log('User data retrieved from storage:', savedUserData ? 'Yes (exists)' : 'No');
        
        if (savedToken && savedUserData) {
          setToken(savedToken);
          setUser(JSON.parse(savedUserData));
          console.log('Auth state restored successfully');
        } else {
          console.log('No saved auth state found');
        }
      } catch (error) {
        console.error('Failed to load authentication state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSavedAuth();
  }, []);

  // Enhanced sign in function with better error handling and logging
  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const loginUrl = buildApiUrl('auth/login');
      console.log(`Attempting to sign in at: ${loginUrl}`);
      
      // Add a timeout to the fetch to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data received:', data ? 'Yes' : 'No');

      if (!response.ok) {
        throw new Error(data.message || `Authentication failed with status ${response.status}`);
      }

      // Assuming the backend returns { token: '...', user: { id: '...', ... } }
      const { token: newToken, user: newUser } = data;

      if (!newToken || !newUser) {
        console.error('Invalid response format:', data);
        throw new Error('Invalid response from server: missing token or user data');
      }

      console.log('Sign in successful, saving data to state and storage');
      setToken(newToken);
      setUser(newUser);

      // Save to AsyncStorage
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, newToken);
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(newUser));
      console.log('Auth data saved to AsyncStorage');

    } catch (error: any) {
      console.error('Sign in error details:', error);
      // If it's an abort error, provide a clearer message
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Server might be down or unreachable.');
      }
      // Re-throw the error so the UI can catch it
      throw error; 
    } finally {
      setIsLoading(false);
    }
  };

  // Real registration implementation using the database
  const signUp = async (details: { email: string; password: string; name?: string }) => {
    setIsLoading(true);
    try {
      const registerUrl = buildApiUrl('auth/register');
      console.log(`Attempting to register at: ${registerUrl}`);
      
      // Add a timeout to the fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(details),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log('Registration response status:', response.status);
      
      // Read response
      let data;
      try {
        data = await response.json();
        console.log('Registration response data:', data);
      } catch (error) {
        console.error('Failed to parse response:', error);
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        throw new Error(data.message || `Registration failed with status ${response.status}`);
      }

      console.log('Registration successful, user can now sign in');
      
    } catch (error: any) {
      console.error('Sign up error details:', error);
      
      // If it's an abort error, provide a clearer message
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Server might be down or unreachable.');
      }
      
      // Re-throw the error so the UI can catch it
      throw error; 
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced sign out function
  const signOut = async () => {
    try {
      setIsLoading(true);
      console.log('Signing out user');
      
      // Clear local state
      setUser(null);
      setToken(null);
      
      // Clear stored auth data
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(USER_DATA_KEY);
      console.log('Auth data cleared from AsyncStorage');
      
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut, signUp }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext); 