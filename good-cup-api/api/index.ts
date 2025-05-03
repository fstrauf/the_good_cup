// api/index.ts - Minimal Node.js Handler Test

import { Hono } from 'hono';
import { handle } from 'hono/vercel';

// Initialize Hono App
const app = new Hono();

// Health Check Route
app.get('/api/health', (c) => {
  console.log('[Hono /api/health] Route matched!');
  return c.json({ 
      status: 'OK', 
      message: 'Hono is running!',
      timestamp: new Date().toISOString() 
  });
});

// Add a basic root handler just in case
app.get('/', (c) => {
    console.log('[Hono /] Root matched!');
    return c.json({ message: 'Hono Root' });
});

// Export the Vercel handler
export default handle(app); 