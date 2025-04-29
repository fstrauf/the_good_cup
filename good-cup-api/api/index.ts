// Minimal Vercel Function for DB Ping Test

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
// Keep schema import for a simple typed query
import * as schema from './schema';

// --- Database Setup ---
const connectionString = process.env.DATABASE_URL;
console.log('[Init] DATABASE_URL retrieved:', connectionString ? 'Exists' : 'MISSING!');

if (!connectionString) {
  console.error('[Init:Error] FATAL: DATABASE_URL environment variable is not set.');
  throw new Error('DATABASE_URL environment variable is not set.');
}

let db: ReturnType<typeof drizzle>;
let sql: ReturnType<typeof neon>;

try {
    console.log('[Init] Initializing Neon client...');
    sql = neon(connectionString);
    console.log('[Init] Neon client initialized.');

    console.log('[Init] Initializing Drizzle client...');
    // Initialize Drizzle within the try block
    db = drizzle(sql, { schema, logger: true }); 
    console.log('[Init] Drizzle client initialized.');
} catch (initError) {
    console.error('[Init:Error] Database initialization failed:', initError);
    // If init fails, subsequent requests hitting DB will fail, which is handled below
}
// --- End Database Setup ---

// --- Vercel Request Handler ---
export default async (req: any, res: any) => {
  // Basic Routing
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  console.log(`[Request] ${method} ${path}`);

  // --- Root Route (Simplest Response) ---
  if (path === '/' && method === 'GET') {
    console.log('[Handler:/] Root GET handler invoked');
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send('API Root OK - Minimal Setup');
  }

  // --- DB Ping Route ---
  else if (path === '/api/ping-db' && method === 'GET') {
    console.log('[Handler:/api/ping-db] DB Ping handler invoked');
    
    // Check if DB initialization failed earlier
    if (!db) {
        console.error('[Handler:/api/ping-db:Error] DB client not initialized.');
        return res.status(500).json({ status: 'error', message: 'Database client failed to initialize' });
    }
    
    try {
      console.log('[Handler:/api/ping-db] Attempting simple DB query...');
      // Perform a very simple query
      const result = await db.select({ id: schema.usersTable.id })
                           .from(schema.usersTable)
                           .limit(1);

      console.log('[Handler:/api/ping-db] DB query successful:', result);
      return res.status(200).json({ status: 'success', data: result });

    } catch (error) {
      console.error('[Handler:/api/ping-db:Error] Error during DB ping query:', error);
      return res.status(500).json({ 
          status: 'error', 
          message: 'DB query failed', 
          details: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  // --- Fallback for unmatched routes ---
  else {
    console.log(`[Handler:NotFound] Route ${method} ${path} not found`);
    return res.status(404).json({ message: 'Route not found' });
  }
}; 

// NO Hono, NO Edge Runtime specifier 