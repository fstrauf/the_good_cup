// api/index.ts - Main API Router

import { URL } from 'url'; // Node.js URL module

// Import handler functions (adjust paths as necessary)
import { handleLogin } from './auth/login';
import { handleDeleteUser } from './user';
// import { handleGetBeans, handlePostBean, ... } from './beans';
// import { handleGetSettings, handleUpdateSettings } from './settings';
// ... import other handlers ...

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
  try {
    const url = new URL(fullUrl);
    path = url.pathname;
  } catch (e) {
    console.error('Error parsing URL:', e);
    return res.status(400).json({ message: 'Invalid request URL' });
  }

  console.log(`[index.ts Router] Request: ${req.method} ${path}`);

  try {
    let result: any;

    // --- Define Routes ---
    if (path === '/api/auth/login' && req.method === 'POST') {
        result = await handleLogin(req, res); 
    } else if (path === '/api/user' && req.method === 'DELETE') {
        result = await handleDeleteUser(req, res);

    // --- Add other routes here ---
    // else if (path === '/api/beans' && req.method === 'GET') {
    //     result = await handleGetBeans(req, res);
    // } else if (path === '/api/beans' && req.method === 'POST') {
    //     result = await handlePostBean(req, res);
    // } // ... handle PUT, DELETE for beans ...
    
    // else if (path.startsWith('/api/beans/') && req.method === 'GET') { // Example: /api/beans/:id
    //     const id = path.split('/')[3];
    //     result = await handleGetBeanById(id); // Refactor handleGetBeanById needed
    // } 
    
    // else if (path === '/api/settings' && req.method === 'GET') {
    //     result = await handleGetSettings(req, res);
    // } else if (path === '/api/settings' && req.method === 'PUT') {
    //     result = await handleUpdateSettings(req, res);
    // } 
    
    // ... etc. for all your endpoints ...
    
    // --- Default / Health check --- 
    // Check root paths *after* specific API paths
    } else if (path === '/' && req.method === 'GET') {
        // Changed to return JSON like other routes for consistency
        return res.status(200).json({ message: 'API Root OK - Central Router' });
    } else if (path === '/api' && req.method === 'GET') {
        return res.status(200).json({ message: 'API /api OK - Central Router' });
    } 
    // Add /api/health route handler import and check if needed
    // else if (path === '/api/health' && req.method === 'GET') { ... }
    
    else {
      // No route matched
      console.warn(`[index.ts Router] Route not found: ${req.method} ${path}`);
      return res.status(404).json({ message: 'API route not found' });
    }

    // --- Success Response ---
    // If we reached here, a handler was called and returned successfully
    // console.log(`[index.ts Router] Success Result for ${req.method} ${path}:`, result);
    return res.status(200).json(result); // Send result from handler

  } catch (error: any) {
    // --- Error Handling ---
    console.error(`[index.ts Router] Error for ${req.method} ${path}:`, error);
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';
    return res.status(status).json({ message });
  }
}; 

// No other helpers or routes needed here 