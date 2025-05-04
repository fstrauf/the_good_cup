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
app.get('/health', async (c) => {
    try {
      console.log('[Hono Node Adapter] /api/health hit');
      const result = await handleHealthCheck(c); 
      return c.json(result); 
    } catch (error: any) {
        console.error('[Hono /health Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
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

// --- Grinder Routes ---
app.get('/grinders', async (c) => {
    try {
        const grinders = await handleGetGrinders(c);
        return c.json(grinders);
    } catch (error: any) { 
        console.error('[Hono /grinders Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.post('/grinders', async (c) => {
    try {
        const result = await handleAddGrinder(c);
        return c.json(result, 201);
    } catch (error: any) {
        console.error('[Hono POST /grinders Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.put('/grinders', async (c) => {
    try {
        const result = await handleUpdateGrinder(c);
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono PUT /grinders Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.delete('/grinders', async (c) => {
    try {
        const result = await handleDeleteGrinder(c);
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono DELETE /grinders Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

// --- Brew Device Routes ---
app.get('/brew-devices', async (c) => {
    try {
        const devices = await handleGetBrewDevices(c);
        return c.json(devices);
    } catch (error: any) { 
        console.error('[Hono /brew-devices Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.post('/brew-devices', async (c) => {
    try {
        const result = await handleAddBrewDevice(c);
        return c.json(result, 201);
    } catch (error: any) {
        console.error('[Hono POST /brew-devices Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.put('/brew-devices', async (c) => {
    try {
        const result = await handleUpdateBrewDevice(c);
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono PUT /brew-devices Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.delete('/brew-devices', async (c) => {
    try {
        const result = await handleDeleteBrewDevice(c);
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono DELETE /brew-devices Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

// --- Settings Routes ---
app.get('/settings', async (c) => {
    try {
        const settings = await handleGetSettings(c);
        return c.json(settings);
    } catch (error: any) { 
        console.error('[Hono /settings Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.put('/settings', async (c) => {
    try {
        const result = await handleUpdateSettings(c);
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono PUT /settings Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

// --- User Delete Route ---
app.delete('/user', async (c) => {
    try {
        const result = await handleDeleteUser(c);
        return c.json(result);
    } catch (error: any) { 
        console.error('[Hono DELETE /user Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

// --- Auth Routes ---
app.post('/auth/register', async (c) => {
    try {
        const result = await handleRegister(c);
        return c.json(result, 201); // Return 201 Created status
    } catch (error: any) {
        console.error('[Hono POST /auth/register Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

app.post('/auth/login', async (c) => {
    try {
        const result = await handleLogin(c); // Refactor handleLogin next
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono POST /auth/login Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

// --- Brew Suggestion Route ---
app.post('/brew-suggestion', async (c) => {
    try {
        const result = await handleBrewSuggestion(c);
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono POST /brew-suggestion Error]:', error);
        return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
    }
});

// --- Analyze Image Route ---
app.post('/analyze-image', async (c) => {
    try {
        const result = await handleAnalyzeImage(c);
        return c.json(result);
    } catch (error: any) {
        console.error('[Hono POST /analyze-image Error]:', error);
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