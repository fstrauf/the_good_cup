// Minimal Vercel Function for DB Ping Test

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
// Keep schema import for a simple typed query
import * as schema from './schema';
import { verify } from 'hono/jwt'; // Keep Hono JWT verify for now
import { eq, and, desc } from 'drizzle-orm';

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

// --- JWT Verification Helper ---
const JWT_SECRET = process.env.JWT_SECRET;

async function verifyAuthToken(req: any): Promise<{ userId: string | null; error?: string; status?: number }> {
  const authHeader = req.headers['authorization'];
  if (!JWT_SECRET) {
    console.error('[Auth:Error] JWT_SECRET missing');
    return { userId: null, error: 'Internal Server Error: Configuration missing', status: 500 };
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, error: 'Unauthorized: Missing or invalid token format', status: 401 };
  }
  const token = authHeader.substring(7);
  try {
    const payload = await verify(token, JWT_SECRET);
    if (!payload || !payload.userId) {
      return { userId: null, error: 'Unauthorized: Invalid token payload', status: 401 };
    }
    console.log(`[Auth:Success] Verified token for user: ${payload.userId}`);
    return { userId: payload.userId as string }; // Success
  } catch (error) {
    console.error('[Auth:Error] Token verification failed:', error);
    const isExpired = error instanceof Error && error.name === 'JwtTokenExpired';
    return { userId: null, error: isExpired ? 'Unauthorized: Token expired' : 'Unauthorized: Invalid token', status: 401 };
  }
}
// --- End JWT Helper ---

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

  // --- GET /api/beans Route ---
  else if (path === '/api/beans' && method === 'GET') {
    console.log('[Handler:/api/beans] GET handler invoked');

    // --- Auth Check ---
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        console.log(`[Handler:/api/beans:AuthFail] ${authResult.status} ${authResult.error}`);
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    const userId = authResult.userId;
    // --- End Auth Check ---

    // Check if DB is initialized
    if (!db) {
        console.error('[Handler:/api/beans:Error] DB client not initialized.');
        return res.status(500).json({ status: 'error', message: 'Database client failed to initialize' });
    }

    try {
      console.log(`[Handler:/api/beans] Fetching beans for user: ${userId}`);
      const beans = await db.select()
        .from(schema.beansTable)
        .where(eq(schema.beansTable.userId, userId))
        .orderBy(schema.beansTable.createdAt);

      console.log(`[Handler:/api/beans] Found ${beans.length} beans for user: ${userId}`);
      return res.status(200).json(beans);

    } catch (error) {
      console.error('[Handler:/api/beans:Error] Error fetching beans:', error);
      return res.status(500).json({ 
          status: 'error', 
          message: 'Internal Server Error fetching beans', 
          details: error instanceof Error ? error.message : String(error) 
      });
    }
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