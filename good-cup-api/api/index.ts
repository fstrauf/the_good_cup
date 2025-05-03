// api/index.ts - Main API Router

import { Hono } from 'hono';
import { handle } from 'hono/vercel';

// Optional: Set to 'edge' if you want to run on Edge Runtime
// export const config = {
//   runtime: 'edge',
// };

// Initialize Hono App WITHOUT basePath
const app = new Hono();

// Simple Health Check Route - Match the full path
app.get('/api/health', (c) => {
  console.log('[Hono Router] /api/health route matched!'); // Updated log
  return c.json({ 
      status: 'OK', 
      message: 'Hono is running!',
      timestamp: new Date().toISOString() 
  });
});

// --- TODO: Add other routes here later using full paths (e.g., /api/beans) ---
// Example:
// import { handleGetBeans } from '../lib/handlers/beanHandler'; 
// app.get('/beans', async (c) => {
//    try {
//       const beans = await handleGetBeans(c.req, c.res); // Pass context if needed
//       return c.json(beans);
//    } catch (error: any) { 
//       console.error('Error in /beans:', error);
//       return c.json({ message: error.message || 'Internal Server Error' }, error.status || 500);
//    }
// });

// Catch-all for 404s
app.notFound((c) => {
    console.warn(`[Hono Router] Not Found (Full Path): ${c.req.method} ${c.req.url}`);
    return c.json({ message: 'API route not found within Hono app' }, 404)
})

// Error handler
app.onError((err, c) => {
    console.error('[Hono Router] Error:', err);
    // Check if it's our structured error from handlers
    if (err instanceof Error && 'status' in err && 'message' in err) {
        return c.json({ message: err.message }, (err as any).status);
    }
    // Generic error
    return c.json({ message: 'Internal Server Error' }, 500);
});

// Export the Vercel handler
export default handle(app); 