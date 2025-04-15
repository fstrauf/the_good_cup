import AsyncStorage from '@react-native-async-storage/async-storage';
// Remove OpenAI import
// import OpenAI from 'openai';
// Remove apiService import
// import { getBrewSuggestionsFromAPI, generateGenericBrewSuggestionFromAPI, analyzeImageFromAPI } from './apiService';

// Interfaces
export interface Brew {
  id: string;
  timestamp: number;
  beanName: string;
  steepTime: number; // Seconds
  useBloom: boolean;
  bloomTime?: string;
  grindSize: string;
  waterTemp: string;
  rating: number;
  notes: string;
  brewDevice?: string;
  grinder?: string;
  roastedDate?: number;
}

// Interface for the structured JSON response from suggestion API calls
export interface BrewSuggestionResponse {
  suggestionText: string;
  suggestedGrindSize: string | null;
  suggestedWaterTemp: string | null; // e.g., "96°C"
  suggestedSteepTimeSeconds: number | null; // e.g., 180
  suggestedUseBloom: boolean;
  suggestedBloomTimeSeconds: number | null; // e.g., 30
}

export interface BrewDevice {
  id: string;
  name: string;
}

export interface Grinder {
  id: string;
  name: string;
}

// Add API_URL definition (using the same logic as auth.tsx)
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// Keep storage keys for now if needed for settings screen
const API_KEY_STORAGE_KEY = '@GoodCup:openaiApiKey';
const BREW_DEVICES_STORAGE_KEY = '@GoodCup:brewDevices';
const GRINDERS_STORAGE_KEY = '@GoodCup:grinders';

// Keep API key functions for now if settings screen still uses them
const getApiKeyInternal = async (): Promise<string | null> => {
  try {
    // First check process.env for Expo public env var
    const expoApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    if (expoApiKey && expoApiKey.trim() !== '' && expoApiKey !== 'your_openai_api_key_here') {
      console.log('Using API key from environment variable');
      return expoApiKey;
    }

    // If no env variable, check AsyncStorage
    console.log('No environment API key found or invalid, checking AsyncStorage');
    const apiKey = await AsyncStorage.getItem(API_KEY_STORAGE_KEY);
    if (apiKey && apiKey.trim() !== '') {
      console.log('Using API key from AsyncStorage');
      return apiKey;
    }

    console.log('No valid API key found in environment or AsyncStorage');
    return null;
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
};

// Save API key to AsyncStorage
export const saveApiKey = async (apiKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    // No client reset needed anymore
  } catch (error) {
    console.error('Error saving API key:', error);
    throw new Error('Failed to save API key');
  }
};

// Get API key (exported for use in settings or elsewhere)
export const getApiKey = async (): Promise<string | null> => {
  return await getApiKeyInternal();
};

// Refactor getBrewSuggestions to call backend
export const getBrewSuggestions = async (
  currentBrew: Brew,
  previousBrews: Brew[],
  selectedBeanName: string | undefined, // Ensure type consistency
  currentGrinderName: string | undefined, // Ensure type consistency
  authToken: string | null // Auth token is now mandatory for backend calls
): Promise<BrewSuggestionResponse> => {
  console.log('Calling backend /api/brew-suggestions...');
  if (!authToken) {
    throw new Error('Authentication token is required to get brew suggestions.');
  }

  try {
    const response = await fetch(`${API_URL}/api/brew-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ 
        currentBrew, 
        previousBrews, 
        selectedBeanName, // Pass these along if needed by backend prompt
        currentGrinderName // Pass these along if needed by backend prompt
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Backend /brew-suggestions error:', data);
      throw new Error(data.error || 'Failed to get brew suggestions from server.');
    }
    
    // Backend should return data matching BrewSuggestionResponse structure
    console.log('Received brew suggestions from backend:', data);
    return data as BrewSuggestionResponse; 

  } catch (error) {
    console.error('Error fetching /brew-suggestions:', error);
    throw error; // Re-throw for the calling component
  }
};

// Refactor analyzeImage to call backend
export const analyzeImage = async (
  base64Image: string,
  authToken: string | null // Auth token is now mandatory
): Promise<any> => { // Return type might need adjustment based on backend response
  console.log('Calling backend /api/analyze-image...');
  if (!authToken) {
    throw new Error('Authentication token is required to analyze image.');
  }
  // Remove prefix if present (backend expects raw base64)
  const rawBase64 = base64Image.startsWith('data:image/jpeg;base64,') 
                      ? base64Image.substring('data:image/jpeg;base64,'.length)
                      : base64Image;

  try {
    const response = await fetch(`${API_URL}/api/analyze-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ image: rawBase64 }), // Send raw base64
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Backend /analyze-image error:', data);
      throw new Error(data.error || 'Failed to analyze image via server.');
    }

    console.log('Received image analysis from backend:', data);
    return data; // Return the JSON data directly

  } catch (error) {
    console.error('Error fetching /analyze-image:', error);
    throw error; // Re-throw for the calling component
  }
};

// Refactor generateGenericBrewSuggestion to call backend
export const generateGenericBrewSuggestion = async (
  bean: { 
    name: string;
    roastLevel: string;
    flavorNotes: string[];
    description: string;
    roastedDate?: number;
    // Add any other fields the backend /brew-suggestion endpoint expects
    country?: string; // Example from backend prompt
    process?: string; // Example from backend prompt
    brewMethod: string; // Mandatory based on backend
  },
  authToken: string | null // Auth token is now mandatory
): Promise<BrewSuggestionResponse> => {
  console.log('Calling backend /api/brew-suggestion...');
  if (!authToken) {
    throw new Error('Authentication token is required to get generic brew suggestion.');
  }

  try {
    const response = await fetch(`${API_URL}/api/brew-suggestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      // Ensure the body matches what the backend expects
      body: JSON.stringify({
        beanName: bean.name,
        country: bean.country, 
        process: bean.process,
        roastLevel: bean.roastLevel,
        flavorNotes: bean.flavorNotes,
        brewMethod: bean.brewMethod,
        roastedDate: bean.roastedDate
      }), 
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Backend /brew-suggestion error:', data);
      throw new Error(data.error || 'Failed to get generic brew suggestion from server.');
    }

    console.log('Received generic brew suggestion from backend:', data);
    return data as BrewSuggestionResponse;

  } catch (error) {
    console.error('Error fetching /brew-suggestion:', error);
    throw error; // Re-throw for the calling component
  }
}; 