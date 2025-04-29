import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// --- Configuration ---
// Hardcode the API URL for local development/simplicity
const API_URL = 'https://the-good-cup-api.vercel.app'; // <-- HARDCODED
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
  const response = await fetchWithAuth(`/brew-devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const deleteBrewDevice = async (id: string): Promise<{ message: string }> => {
  const response = await fetchWithAuth(`/brew-devices/${id}`, {
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
  const response = await fetchWithAuth(`/grinders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const deleteGrinder = async (id: string): Promise<{ message: string }> => {
  const response = await fetchWithAuth(`/grinders/${id}`, {
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
  const response = await fetchWithAuth(`/beans/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
};

export const deleteBean = async (id: string): Promise<{ message: string }> => {
  const response = await fetchWithAuth(`/beans/${id}`, {
    method: 'DELETE',
  });
  return response.json();
}; 