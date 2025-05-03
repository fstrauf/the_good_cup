// api/index.ts - Minimal Node.js Handler Test

import { Hono } from 'hono';

// Initialize Hono App
const app = new Hono();

// Health Check Route
app.get('/api/health', (c) => {
  console.log('[Hono /api/health] Route matched!');
  return c.json({ 
      status: 'OK', 
      message: 'Hono is running (manual fetch)!',
      timestamp: new Date().toISOString() 
  });
});

// Add a basic root handler just in case
app.get('/', (c) => {
    console.log('[Hono /] Root matched!');
    return c.json({ message: 'Hono Root (manual fetch)' });
});

// Default Vercel handler signature
export default async function handler(req: Request, context: any) {
    // Log the path directly from req.url
    console.log(`[Manual Fetch Handler] Received Path: '${req.url}', Method: ${req.method}`);
    // Manually invoke Hono's fetch handler
    return await app.fetch(req, process.env, context);
} 