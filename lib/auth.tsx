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

// Placeholder for your backend API URL
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'; // Use environment variable

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
        const savedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        const savedUserData = await AsyncStorage.getItem(USER_DATA_KEY);
        
        if (savedToken && savedUserData) {
          setToken(savedToken);
          setUser(JSON.parse(savedUserData));
        }
      } catch (error) {
        console.error('Failed to load authentication state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSavedAuth();
  }, []);

  // Updated Sign in function for email/password
  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      // Assuming the backend returns { token: '...', user: { id: '...', ... } }
      const { token: newToken, user: newUser } = data;

      if (!newToken || !newUser) {
        throw new Error('Invalid response from server');
      }

      setToken(newToken);
      setUser(newUser);

      // Save to AsyncStorage
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, newToken);
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(newUser));

    } catch (error: any) {
      console.error('Sign in error:', error);
      // Re-throw the error so the UI can catch it
      throw error; 
    } finally {
      setIsLoading(false);
    }
  };

  // Add the Sign Up function
  const signUp = async (details: { email: string; password: string; name?: string }) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(details), // Send email, password, name
      });

      const data = await response.json();

      if (!response.ok) {
        // Specific check for conflict error
        if (response.status === 409) {
          throw new Error(data.message || 'Email already exists.');
        }
        throw new Error(data.message || 'Registration failed');
      }

      // Registration successful, but don't log in automatically.
      // The user object might be returned in `data.user` if needed.
      console.log('Registration successful:', data);
      // Optionally automatically sign in after successful registration:
      // await signIn(details.email, details.password);

    } catch (error: any) {
      console.error('Sign up error:', error);
      // Re-throw the error so the UI can catch it
      throw error; 
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out function (remains largely the same, could add backend call)
  const signOut = async () => {
    try {
      setIsLoading(true);
      // Optional: Call a backend /api/auth/logout endpoint here
      // await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });

      // Clear local state
      setUser(null);
      setToken(null);
      
      // Clear stored auth data
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(USER_DATA_KEY);
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