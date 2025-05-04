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
  steepTimeFormatted: string;
  bloomTimeFormatted: string;
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
export async function getBrewSuggestions(
  currentBrew: Brew,
  previousBrews: Brew[],
  selectedBeanName: string,
  currentGrinderName: string | undefined,
  authToken: string | null,
  userComment?: string
): Promise<BrewSuggestionResponse | null> {
  try {
    if (!authToken) {
      console.error('No authentication token provided for getBrewSuggestions');
      return null;
    }

    console.log('Calling API with currentBrew:', currentBrew, 'Comment:', userComment);
    
    const response = await fetch(`${API_URL}/api/brew-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        currentBrew,
        previousBrews,
        selectedBeanName,
        currentGrinderName,
        userComment
      })
    });

    console.log('API response status:', response.status);
    
    if (!response.ok) {
      if (response.status === 401) {
        console.error('Unauthorized: Invalid or expired token');
        return null;
      }
      
      const errorText = await response.text();
      console.error('Failed to get brew suggestions:', errorText);
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Non-JSON response received:', await response.text());
      return null;
    }

    const data = await response.json();
    console.log('Raw API response data:', data);
    
    // Clean up the data to ensure it matches the expected type
    const cleanedData: BrewSuggestionResponse = {
      suggestionText: data.suggestionText || '',
      suggestedGrindSize: data.suggestedGrindSize || null,
      suggestedWaterTemp: data.suggestedWaterTemp || null,
      suggestedSteepTimeSeconds: 
        typeof data.suggestedSteepTimeSeconds === 'string' 
          ? parseInt(data.suggestedSteepTimeSeconds.replace(/\D/g, '')) 
          : data.suggestedSteepTimeSeconds || null,
      suggestedUseBloom: !!data.suggestedUseBloom,
      suggestedBloomTimeSeconds: 
        typeof data.suggestedBloomTimeSeconds === 'string' 
          ? parseInt(data.suggestedBloomTimeSeconds.replace(/\D/g, '')) 
          : data.suggestedBloomTimeSeconds || null,
      steepTimeFormatted: data.steepTimeFormatted || '',
      bloomTimeFormatted: data.bloomTimeFormatted || ''
    };
    
    console.log('Cleaned data:', cleanedData);
    return cleanedData;
    
  } catch (error) {
    console.error('Error in getBrewSuggestions:', error);
    return null;
  }
}

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
    console.log(`Using API URL: ${API_URL}/api/analyze-image`);
    console.log('Auth token present:', authToken ? 'Yes' : 'No');
    
    const response = await fetch(`${API_URL}/api/analyze-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.trim()}`,
      },
      body: JSON.stringify({ image: rawBase64 }), // Send raw base64
    });

    // --- Debugging: Log response headers --- 
    const headersObject = {};
    response.headers.forEach((value: string, key: string) => {
      (headersObject as any)[key] = value; 
    });
    console.log('[openai.ts] Response headers received:', JSON.stringify(headersObject));
    // --- End Debugging ---

    // --- Debugging: Read raw text first --- 
    const rawText = await response.text();
    console.log('[openai.ts] Raw response text received:', rawText);
    // --- End Debugging --- 

    // --- Parse the raw text --- 
    let data = {}; // Default to empty object in case of parsing error
    try {
        data = JSON.parse(rawText);
    } catch (parseError) {
        console.error('[openai.ts] Failed to parse response text as JSON:', parseError);
        // If parsing fails, we need to decide how to handle it.
        // For now, we will still check response.ok but data might be {}.
        // Throwing here might be better if JSON is always expected on success.
        if (response.ok) {
           // If status was OK but parsing failed, throw a specific error
           throw new Error('Received non-JSON response from server despite OK status.');
        } 
        // If status was not OK, the error will be handled below based on response.ok
    }
    // --- End Parsing --- 

    if (!response.ok) {
      console.error('Backend /analyze-image error status:', response.status, 'Parsed Body:', data);
      if (response.status === 401) {
        throw new Error('Unauthorized: Authentication failed. Please sign in again.');
      }
      // Try to get error message from parsed data, falling back to status text
      const errorMessage = (data as any)?.message || response.statusText || 'Failed to analyze image via server.';
      throw new Error(errorMessage);
    }

    console.log('[openai.ts] Parsed image analysis data from backend:', data); // Log the parsed data
    return data; // Return the parsed data

  } catch (error) {
    console.error('Error fetching /analyze-image:', error);
    throw error; // Re-throw for the calling component
  }
};

// Refactor generateGenericBrewSuggestion to call backend
export async function generateGenericBrewSuggestion(
  bean: {
    name: string;
    roastLevel: string;
    flavorNotes: string[];
    description: string;
    roastedDate?: number;
    country?: string;
    process?: string;
    brewMethod: string;
  },
  authToken: string | null,
  userComment?: string
): Promise<BrewSuggestionResponse | null> {
  try {
    if (!authToken) {
      console.error('No authentication token provided for generateGenericBrewSuggestion');
      return null;
    }

    console.log('Calling API with bean data:', bean, 'Comment:', userComment);
    
    const response = await fetch(`${API_URL}/api/brew-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        beanName: bean.name,
        country: bean.country,
        process: bean.process,
        roastLevel: bean.roastLevel,
        flavorNotes: bean.flavorNotes,
        roastedDate: bean.roastedDate,
        brewMethod: bean.brewMethod || 'French Press',
        userComment
      })
    });

    console.log('API response status:', response.status);
    
    if (!response.ok) {
      if (response.status === 401) {
        console.error('Unauthorized: Invalid or expired token');
        return null;
      }
      
      const errorText = await response.text();
      console.error('Failed to get generic brew suggestion:', errorText);
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const rawResponse = await response.text();
      console.error('Non-JSON response received:', rawResponse);
      return null;
    }

    const data = await response.json();
    console.log('Raw API response data:', data);
    
    // Clean up the data to ensure it matches the expected type
    const cleanedData: BrewSuggestionResponse = {
      suggestionText: data.suggestionText || '',
      suggestedGrindSize: data.suggestedGrindSize || null,
      suggestedWaterTemp: data.suggestedWaterTemp || null,
      suggestedSteepTimeSeconds: 
        typeof data.suggestedSteepTimeSeconds === 'string' 
          ? parseInt(data.suggestedSteepTimeSeconds.replace(/\D/g, '')) 
          : data.suggestedSteepTimeSeconds || null,
      suggestedUseBloom: !!data.suggestedUseBloom,
      suggestedBloomTimeSeconds: 
        typeof data.suggestedBloomTimeSeconds === 'string' 
          ? parseInt(data.suggestedBloomTimeSeconds.replace(/\D/g, '')) 
          : data.suggestedBloomTimeSeconds || null,
      steepTimeFormatted: data.steepTimeFormatted || '',
      bloomTimeFormatted: data.bloomTimeFormatted || ''
    };
    
    console.log('Cleaned data:', cleanedData);
    return cleanedData;
    
  } catch (error) {
    console.error('Error in generateGenericBrewSuggestion:', error);
    return null;
  }
} 