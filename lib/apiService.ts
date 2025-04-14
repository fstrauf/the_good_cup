import { BrewSuggestionResponse } from './openai';

// Change this to your actual backend API URL when you create it
const API_BASE_URL = 'https://api.yourgoodcupapp.com';

/**
 * Makes an authenticated API call to your backend service
 * The backend will then use its securely stored OpenAI API key to call OpenAI
 */
export async function fetchWithAuth(
  endpoint: string, 
  token: string | null, 
  options: RequestInit = {}
) {
  // Handle missing token
  if (!token) {
    throw new Error('Authentication required. Please sign in.');
  }
  
  // Build request with authentication
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    // Check for error responses
    if (!response.ok) {
      // Try to get error message from response body
      try {
        const errorData = await response.json();
        throw new Error(errorData.message || `API error: ${response.status}`);
      } catch (e) {
        throw new Error(`API error: ${response.status}`);
      }
    }
    
    // Parse JSON response or return null for no content
    if (response.status === 204) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

/**
 * Gets brew suggestions from your backend, which will call OpenAI
 */
export async function getBrewSuggestionsFromAPI(
  authToken: string | null,
  currentBrew: any,
  previousBrews: any[],
  selectedBeanName?: string,
  currentGrinderName?: string
): Promise<BrewSuggestionResponse> {
  return fetchWithAuth('/api/brew-suggestions', authToken, {
    method: 'POST',
    body: JSON.stringify({
      currentBrew,
      previousBrews,
      selectedBeanName,
      currentGrinderName
    }),
  });
}

/**
 * Gets generic brew suggestion from your backend based on bean characteristics
 */
export async function generateGenericBrewSuggestionFromAPI(
  authToken: string | null,
  bean: any
): Promise<BrewSuggestionResponse> {
  return fetchWithAuth('/api/generic-brew-suggestion', authToken, {
    method: 'POST',
    body: JSON.stringify({ bean }),
  });
}

/**
 * Analyzes an image using the OpenAI Vision API via your secure backend
 */
export async function analyzeImageFromAPI(
  authToken: string | null,
  base64Image: string
): Promise<any> {
  return fetchWithAuth('/api/analyze-image', authToken, {
    method: 'POST',
    body: JSON.stringify({ image: base64Image }),
  });
} 