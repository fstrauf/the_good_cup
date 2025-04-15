import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
// Import the NAMED export { app } which is the Hono instance
import { app } from './api/index'; 

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



curl -X POST http://localhost:3000/auth/login \
-H "Content-Type: application/json" \
-d '{ "email": "log@example.com", "password": "password123" }'