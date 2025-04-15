import { Hono } from 'hono';
import { handle } from 'hono/vercel';

export const runtime = 'edge';

const app = new Hono();

// Minimal GET route
app.get('/', (c) => {
  console.log('--- Minimal GET / handler invoked ---');
  return c.json({ success: true, message: 'Minimal GET / route hit' });
});

// Minimal POST route
app.post('/auth/login', (c) => {
  console.log('--- Minimal POST /auth/login handler invoked ---');
  // In a real scenario, you'd await c.req.json() here
  return c.json({ success: true, message: 'Minimal POST /auth/login route hit' });
});

// Keep the named export for potential local testing needs (though server.ts is currently broken)
export { app };

// Default export for Vercel
export default handle(app); 