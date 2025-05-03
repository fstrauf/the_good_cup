// api/index.ts - Main API Router

import { URL } from 'url'; // Node.js URL module

// Import handler functions from the new location
import { handleLogin } from '../lib/handlers/loginHandler'; // Updated path
import { handleDeleteUser } from '../lib/handlers/userHandler'; // Import user handlers
import {
  handleGetGrinders,
  handleAddGrinder,
  handleUpdateGrinder,
  handleDeleteGrinder
} from '../lib/handlers/grinderHandler'; // Import grinder handlers
import {
  handleGetBeans,
  handleAddBean,
  handleUpdateBean,
  handleDeleteBean,
  handleGetBeanById // Import bean handlers
} from '../lib/handlers/beanHandler'; 
import {
  handleGetBrewDevices,
  handleAddBrewDevice,
  handleUpdateBrewDevice,
  handleDeleteBrewDevice // Import brew device handlers
} from '../lib/handlers/brewDeviceHandler';
import {
  handleGetSettings,
  handleUpdateSettings // Import settings handlers
} from '../lib/handlers/settingsHandler';
import { handleBrewSuggestion } from '../lib/handlers/brewSuggestionHandler'; // Import suggestion handler
import { handleAnalyzeImage } from '../lib/handlers/analyzeImageHandler'; // Import image handler
import { handleRegister } from '../lib/handlers/registerHandler'; // Import register handler
import { handleHealthCheck } from '../lib/handlers/healthHandler'; // Import health handler
// import { handleGetSettings, handleUpdateSettings } from '../lib/handlers/settingsHandler'; // Example for others
// ... import other handlers from ../lib/handlers/ ...

// --- Vercel Request Handler for ALL API routes ---
export default async (req: any, res: any) => {
  // --- CORS Handling (Apply to all responses) ---
  // IMPORTANT: Restrict this in production!
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --- Routing ---
  // Use req.url and req.headers.host safely
  const host = req.headers['host'] || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'http'; // Use x-forwarded-proto on Vercel
  const fullUrl = `${protocol}://${host}${req.url || '/'}`;
  let path = '/';
  let url: URL; // Declare url variable here
  try {
    url = new URL(fullUrl); // Assign inside try
    path = url.pathname;
    // *** Log the exact path and method received ***
    console.log(`[index.ts Router] Received Path: '${path}', Method: ${req.method}`);
  } catch (e) {
    console.error('[index.ts Router] Error parsing URL:', fullUrl, e);
    return res.status(400).json({ message: 'Invalid request URL' });
  }

  try {
    let result: any;
    const queryParams = url.searchParams; // Use the url variable defined above
    console.log(`[index.ts Router] Routing check for: ${req.method} ${path}`); // Log before checks

    // --- Define Routes ---
    if (path === '/api/auth/register' && req.method === 'POST') {
        console.log('[index.ts Router] Matched: POST /api/auth/register'); // Log match
        result = await handleRegister(req, res);
    } else if (path === '/api/auth/login' && req.method === 'POST') {
        console.log('[index.ts Router] Matched: POST /api/auth/login'); // Log match
        result = await handleLogin(req, res); 
    } else if (path === '/api/user' && req.method === 'DELETE') {
        console.log('[index.ts Router] Matched: DELETE /api/user'); // Log match
        result = await handleDeleteUser(req, res);
    
    // --- Grinder Routes ---
    } else if (path === '/api/grinders' && req.method === 'GET') {
        console.log('[index.ts Router] Matched: GET /api/grinders'); // Log match
        result = await handleGetGrinders(req, res);
    } else if (path === '/api/grinders' && req.method === 'POST') {
        result = await handleAddGrinder(req, res);
    } else if (path === '/api/grinders' && req.method === 'PUT') {
        result = await handleUpdateGrinder(req, res);
    } else if (path === '/api/grinders' && req.method === 'DELETE') {
        result = await handleDeleteGrinder(req, res);
        
    // --- Bean Routes ---
    } else if (path === '/api/beans' && req.method === 'GET') {
        // *** Log entering this specific block ***
        console.log('[index.ts Router] Matched block: GET /api/beans'); 
        if (queryParams.has('id')) {
             console.log('[index.ts Router] Matched: GET /api/beans?id=...'); // Log match
             result = await handleGetBeanById(req, res); // Handler uses req.url
        } else {
             console.log('[index.ts Router] Matched: GET /api/beans (all)'); // Log match
             result = await handleGetBeans(req, res); // Get all beans
        }
    } else if (path === '/api/beans' && req.method === 'POST') {
        result = await handleAddBean(req, res);
    } else if (path === '/api/beans' && req.method === 'PUT') {
        result = await handleUpdateBean(req, res); // Handler uses req.url for id
    } else if (path === '/api/beans' && req.method === 'DELETE') {
        result = await handleDeleteBean(req, res); // Handler uses req.url for id
        
    // --- Brew Device Routes ---
    } else if (path === '/api/brew-devices' && req.method === 'GET') {
        result = await handleGetBrewDevices(req, res);
    } else if (path === '/api/brew-devices' && req.method === 'POST') {
        result = await handleAddBrewDevice(req, res);
    } else if (path === '/api/brew-devices' && req.method === 'PUT') {
        result = await handleUpdateBrewDevice(req, res);
    } else if (path === '/api/brew-devices' && req.method === 'DELETE') {
        result = await handleDeleteBrewDevice(req, res);
        
    // --- Settings Routes ---
    } else if (path === '/api/settings' && req.method === 'GET') {
        result = await handleGetSettings(req, res);
    } else if (path === '/api/settings' && req.method === 'PUT') {
        result = await handleUpdateSettings(req, res);
        
    // --- Brew Suggestion Route ---
    } else if (path === '/api/brew-suggestion' && req.method === 'POST') {
        result = await handleBrewSuggestion(req, res);

    // --- Analyze Image Route ---
    } else if (path === '/api/analyze-image' && req.method === 'POST') {
        result = await handleAnalyzeImage(req, res);
        
    // --- Default / Health check --- 
    // Check root paths *after* specific API paths
    } else if (path === '/' && req.method === 'GET') {
        // Changed to return JSON like other routes for consistency
        return res.status(200).json({ message: 'API Root OK - Central Router' });
    } else if (path === '/api' && req.method === 'GET') {
        return res.status(200).json({ message: 'API /api OK - Central Router' });
    } else if (path === '/api/health' && req.method === 'GET') {
        console.log('[index.ts Router] Matched: GET /api/health'); // Log match
        result = await handleHealthCheck(req, res);
    } 
    // Add /api/health route handler import and check if needed
    // else if (path === '/api/health' && req.method === 'GET') { ... }
    
    else {
      // No route matched
      // *** Log that no route was matched ***
      console.warn(`[index.ts Router] No route matched for: ${req.method} ${path}`); 
      return res.status(404).json({ message: 'API route not found' });
    }

    // --- Success Response ---
    console.log(`[index.ts Router] Handler success for: ${req.method} ${path}`); // Log success
    return res.status(200).json(result); // Send result from handler

  } catch (error: any) {
    // --- Error Handling ---
    // *** Log the error being caught ***
    console.error(`[index.ts Router] Caught error for ${req.method} ${path}:`, error);
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';
    return res.status(status).json({ message });
  }
}; 

// No other helpers or routes needed here 