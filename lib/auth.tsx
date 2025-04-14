import React, { createContext, useContext, useState, useEffect } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Register the redirect URI handler for the authentication flow
WebBrowser.maybeCompleteAuthSession();

// Define the shape of our auth context
type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
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

// Create the context with a default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
  token: null,
});

// Config for your authentication provider (You'll need to set this up)
// Replace these values with your actual auth provider details
const authConfig = {
  clientId: 'YOUR_CLIENT_ID', // Replace with your OAuth client ID
  redirectUri: AuthSession.makeRedirectUri({
    scheme: 'the-good-cup' // Your app's custom URL scheme
  }),
  // If using Google, the discovery document URL is:
  // discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration'
  // For other providers, you may need different URLs or configurations
};

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

  // Sign in function using your chosen OAuth provider
  const signIn = async () => {
    try {
      setIsLoading(true);

      // For demonstration - actual implementation will depend on your chosen provider
      // If using Google, Facebook, or another OAuth provider
      const authRequest = new AuthSession.AuthRequest({
        clientId: authConfig.clientId,
        redirectUri: authConfig.redirectUri,
        responseType: 'token', // or 'code' if using authorization code flow
        scopes: ['openid', 'profile', 'email']
      });

      const result = await authRequest.promptAsync({
        // The authentication endpoint 
        // For Google: 'https://accounts.google.com/o/oauth2/v2/auth'
        // Replace with your provider's endpoint
        authorizationEndpoint: 'YOUR_AUTH_ENDPOINT'
      });

      if (result.type === 'success') {
        // Extract the token from the response
        const newToken = result.params.access_token;
        setToken(newToken);

        // Fetch user profile with the token
        // This will vary based on your provider
        const userInfoResponse = await fetch('YOUR_USERINFO_ENDPOINT', {
          headers: { Authorization: `Bearer ${newToken}` }
        });
        
        const userData = await userInfoResponse.json();
        const newUser = {
          id: userData.sub || userData.id,
          email: userData.email,
          name: userData.name
        };
        
        setUser(newUser);

        // Save to AsyncStorage
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, newToken);
        await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(newUser));
      }
    } catch (error) {
      console.error('Authentication error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setIsLoading(true);
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
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext); 