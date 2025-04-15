import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
// Import only the Hono app instance
import app from './api/index'; 

// Load environment variables from .env file
dotenv.config();

// Remove DB client creation and middleware
/*
const db = createDbClient(); 
app.use('*' , async (c, next) => {
  c.set('db', db);
  await next();
});
*/

const port = 3001; 

console.log(`Node.js server listening on port ${port}`);

serve({
  fetch: app.fetch, 
  port: port,
}); 