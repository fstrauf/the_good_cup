// api/index.ts - Manual API Router (Reverted)

import { URL } from 'url'; // Node.js URL module
import { Hono } from 'hono';
// Import the specific handler for Vercel Node.js runtime
import { handle } from '@hono/node-server/vercel';

// Import ALL handler functions from lib/handlers
import { handleLogin } from '../lib/handlers/loginHandler';
import { handleDeleteUser } from '../lib/handlers/userHandler';
import {
  handleGetGrinders,
  handleAddGrinder,
  handleUpdateGrinder,
  handleDeleteGrinder
} from '../lib/handlers/grinderHandler';
import {
  handleGetBeans,
  handleAddBean,
  handleUpdateBean,
  handleDeleteBean,
  handleGetBeanById
} from '../lib/handlers/beanHandler'; 
import {
  handleGetBrewDevices,
  handleAddBrewDevice,
  handleUpdateBrewDevice,
  handleDeleteBrewDevice
} from '../lib/handlers/brewDeviceHandler';
import {
  handleGetSettings,
  handleUpdateSettings
} from '../lib/handlers/settingsHandler';
import { handleBrewSuggestion } from '../lib/handlers/brewSuggestionHandler';
import { handleAnalyzeImage } from '../lib/handlers/analyzeImageHandler';
import { handleRegister } from '../lib/handlers/registerHandler';
import { handleHealthCheck } from '../lib/handlers/healthHandler';

// Required config to disable Vercel helpers (as per Hono docs)
export const config = {
  api: {
    bodyParser: false, // Let Hono handle body parsing
  },
  // Explicitly set runtime if needed, otherwise defaults to Node.js
  // runtime: 'nodejs' 
};

const app = new Hono().basePath('/api'); // Keep basePath for now

app.get('/hello', (c) => {
  console.log('[Hono Node Adapter] /api/hello hit');
  return c.json({
    message: 'Hello from Hono Node.js Adapter!',
  });
});

// Health check for testing
app.get('/health', (c) => {
  console.log('[Hono Node Adapter] /api/health hit');
  return c.json({ 
      status: 'OK', 
      message: 'Hono Node Adapter is running!',
      timestamp: new Date().toISOString() 
  });
});

// --- Bean Routes ---
app.get('/beans', async (c) => {
    const id = c.req.query('id'); 
    console.log(`[Hono GET /beans] id query param: ${id}`);
    try {
        if (id) {
            const bean = await handleGetBeanById(c); // Pass full context c
            return c.json(bean);
        } else {
            const beans = await handleGetBeans(c); // Pass full context c
            return c.json(beans);
        }
    } catch (error: any) { 
        console.error('[Hono /beans Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.post('/beans', async (c) => {
    try {
        const result = await handleAddBean(c); // Pass full context c
        return c.json(result, 201); 
    } catch (error: any) {
        console.error('[Hono POST /beans Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.put('/beans', async (c) => {
    try {
        const result = await handleUpdateBean(c); // Pass full context c
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono PUT /beans Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.delete('/beans', async (c) => {
    try {
        const result = await handleDeleteBean(c); // Pass full context c
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono DELETE /beans Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

// Catch-all for 404s within /api base path
app.notFound((c) => {
    console.warn(`[Hono Node Adapter] Not Found: ${c.req.method} ${c.req.url}`);
    return c.json({ message: 'API route not found within Hono app' }, 404)
})

// --- Vercel Request Handler for ALL API routes ---
export default handle(app); 