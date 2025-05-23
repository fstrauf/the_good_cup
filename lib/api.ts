import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// --- Configuration ---
// Use the environment variable set in eas.json
const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  // Throw an error during development if the URL isn't set,
  // but allow builds to proceed (where EAS will set it).
  // You might want a different strategy for local dev without EAS CLI.
  console.error("ERROR: EXPO_PUBLIC_API_URL environment variable is not set!");
  // Optionally throw an error to prevent the app from running without a configured API
  // throw new Error("API URL is not configured. Set EXPO_PUBLIC_API_URL in your environment or eas.json.");
}

// Hardcode the API URL for local development/simplicity
// const API_URL = 'https://the-good-cup-api.vercel.app'; // <-- REMOVED HARDCODED URL
// Retrieve the API URL from Expo constants (environment variables)
// const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000'; // Provide a fallback for local dev
const TOKEN_KEY = 'jwt_token'; // Key used to store the token securely

// --- Interfaces (mirroring backend/schema) ---
// These should ideally be shared between frontend and backend
export interface BrewDevice {
  id: string;
  userId: string;
  name: string;
  type: string | null;
  notes: string | null;
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

export interface Grinder {
  id: string;
  userId: string;
  name: string;
  type: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  userId?: string; // Optional because GET might return empty if no settings exist
  defaultBrewDeviceId: string | null;
  defaultGrinderId: string | null;
  updatedAt?: string; // Optional because GET might return empty
}

export interface Bean { // Define and export Bean interface
  id: string;
  userId: string;
  name: string;
  roaster: string | null;
  origin: string | null;
  process: string | null;
  roastLevel: string | null;
  roastedDate: string | null; // Expecting ISO date string from backend
  flavorNotes: string[] | null;
  imageUrl: string | null;
  description: string | null; // Add description field
  createdAt: string;
  updatedAt: string;
}

// --- Authentication Token ---
export const getToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error("SecureStore.getItemAsync failed:", error);
    return null;
  }
};

export const storeToken = async (token: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    console.log("Token stored successfully."); // Optional logging
  } catch (error) {
    console.error("SecureStore.setItemAsync failed:", error);
    // Handle error appropriately, maybe re-throw or show alert
  }
};

export const removeToken = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    console.log("Token removed successfully."); // Optional logging
  } catch (error) {
    console.error("SecureStore.deleteItemAsync failed:", error);
     // Handle error appropriately
  }
};

// --- Core Fetch Function ---
const fetchWithAuth = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const token = await getToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.append('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body) {
    headers.append('Content-Type', 'application/json');
  }

  // Prepend /api to the endpoint for Vercel deployment
  const fullUrl = `${API_URL}/api${endpoint}`;
  console.log('Making API request to:', fullUrl); // Add logging for debugging

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Attempt to parse error message from backend
    let errorBody;
    try {
        errorBody = await response.json();
    } catch (e) {
        // Ignore if response is not JSON
    }
    const errorMessage = errorBody?.message || `HTTP error! status: ${response.status}`;
    console.error(`API Error (${endpoint}):`, errorMessage, errorBody);
    throw new Error(errorMessage);
  }

  return response;
};

// --- API Service Functions ---

// Brew Devices
export const getBrewDevices = async (): Promise<BrewDevice[]> => {
  const response = await fetchWithAuth('/brew-devices');
  return response.json();
};

export const addBrewDevice = async (data: { name: string; type?: string; notes?: string }): Promise<BrewDevice> => {
  const response = await fetchWithAuth('/brew-devices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const updateBrewDevice = async (id: string, data: { name: string; type?: string; notes?: string }): Promise<BrewDevice> => {
  // Use query parameter for ID
  const response = await fetchWithAuth(`/brew-devices?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const deleteBrewDevice = async (id: string): Promise<{ message: string }> => {
  // Use query parameter for ID
  const response = await fetchWithAuth(`/brew-devices?id=${id}`, {
    method: 'DELETE',
  });
  return response.json();
};

// Grinders
export const getGrinders = async (): Promise<Grinder[]> => {
  const response = await fetchWithAuth('/grinders');
  return response.json();
};

export const addGrinder = async (data: { name: string; type?: string; notes?: string }): Promise<Grinder> => {
  const response = await fetchWithAuth('/grinders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const updateGrinder = async (id: string, data: { name: string; type?: string; notes?: string }): Promise<Grinder> => {
  // Use query parameter for ID
  const response = await fetchWithAuth(`/grinders?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const deleteGrinder = async (id: string): Promise<{ message: string }> => {
  // Use query parameter for ID
  const response = await fetchWithAuth(`/grinders?id=${id}`, {
    method: 'DELETE',
  });
  return response.json();
};

// User Settings
export const getUserSettings = async (): Promise<UserSettings> => {
  const response = await fetchWithAuth('/settings');
  return response.json();
};

export const updateUserSettings = async (data: { defaultBrewDeviceId?: string | null; defaultGrinderId?: string | null }): Promise<UserSettings> => {
  const response = await fetchWithAuth('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
};

// --- User Account ---
/**
 * Deletes the currently authenticated user's account.
 * Expects a backend endpoint like DELETE /api/user.
 */
export const deleteAccount = async (): Promise<{ message: string }> => {
  const response = await fetchWithAuth('/user', { // Assuming DELETE /api/user endpoint
    method: 'DELETE',
  });
  return response.json(); // Assuming backend returns { message: "Account deleted successfully" }
};

// Beans
export const getBeans = async (): Promise<Bean[]> => {
  const response = await fetchWithAuth('/beans');
  return response.json();
};

export const addBean = async (data: Partial<Omit<Bean, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Bean> => {
   // Ensure required fields like name are present if necessary before calling
  const response = await fetchWithAuth('/beans', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const updateBean = async (id: string, data: Partial<Omit<Bean, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Bean> => {
  // Use query parameter for ID
  const response = await fetchWithAuth(`/beans?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const deleteBean = async (id: string): Promise<{ message: string }> => {
  // Use query parameter for ID
  const response = await fetchWithAuth(`/beans?id=${id}`, {
    method: 'DELETE',
  });
  return response.json();
};

/**
 * Fetches a single bean by its ID.
 */
export const getBeanById = async (id: string): Promise<Bean | null> => {
  // Use query parameter for ID
  const url = `${API_URL}/api/beans?id=${id}`; // Construct URL with query param for fetchWithAuth
  console.log(`[api.getBeanById] GET ${url}`);
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) {
    console.error("[api.getBeanById] No token found");
    throw new Error("Authentication required");
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    console.log(`[api.getBeanById] Response Status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[api.getBeanById] Bean with ID ${id} not found (404).`);
        return null; // Specific handling for 404
      } 
      // Try to get error message from response body
      let errorMessage = `API error ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = `${errorMessage}: ${errorData?.message || 'Unknown error'}`;
        console.error(`[api.getBeanById] Error Response Body:`, errorData);
      } catch (jsonError) {
        // If response is not JSON or reading body fails
        console.error("[api.getBeanById] Could not parse error response body");
      }
      console.error(`[api.getBeanById] Fetch Error: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    const data: Bean = await response.json();
    return data;

  } catch (error: any) {
    // Catch network errors or errors thrown from response.ok check
    console.error("[api.getBeanById] Network or Parsing Error:", error);
    // Re-throw the caught error or a generic one
    throw new Error(error instanceof Error ? error.message : "An unexpected error occurred while fetching the bean");
  }
};

/**
 * Fetches a single brew device by its ID.
 */
export const getBrewDeviceById = async (id: string): Promise<BrewDevice | null> => {
  const url = `${API_URL}/api/brew-devices?id=${id}`; // Use query param
  console.log(`[api.getBrewDeviceById] GET ${url}`);
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) {
    console.error("[api.getBrewDeviceById] No token found");
    throw new Error("Authentication required");
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      let errorBody; try { errorBody = await response.json(); } catch (e) {}
      throw new Error(errorBody?.message || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error("[api.getBrewDeviceById] Error:", error);
    throw new Error(error instanceof Error ? error.message : "An unexpected error occurred");
  }
};

// Define the expected response structure for suggestions
export interface BrewSuggestionResponse {
  suggestionText: string | null;
  suggestedGrindSize: string | null;
  suggestedWaterTemp: string | null;
  suggestedSteepTimeSeconds: number | null;
  suggestedUseBloom: boolean;
  suggestedBloomTimeSeconds: number | null;
  // Add formatted times if the backend includes them
  steepTimeFormatted?: string;
  bloomTimeFormatted?: string;
}

/**
 * Fetches a generic brew suggestion based on bean details and brew method.
 */
export const getGenericBrewSuggestion = async (
  bean: Bean,
  brewMethod: string,
  userComment?: string
): Promise<BrewSuggestionResponse> => {
  const endpoint = '/brew-suggestion';
  console.log(`[api.getGenericBrewSuggestion] POST ${endpoint} with method: ${brewMethod}`);
  
  const requestBody = {
    beanName: bean.name,
    roastLevel: bean.roastLevel,
    flavorNotes: bean.flavorNotes,
    roastedDate: bean.roastedDate, // Pass ISO string
    country: bean.origin, // Map origin to country for backend
    process: bean.process,
    brewMethod: brewMethod,
    userComment: userComment || null,
    // Ensure all fields expected by the backend generic prompt are included
  };

  const response = await fetchWithAuth(endpoint, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });

  // Backend endpoint already parses/formats, expect JSON directly
  return response.json(); 
};

/**
 * Fetches brew devices for the user.
 */ 