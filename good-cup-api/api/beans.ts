// api/beans.ts - Handles GET /api/beans

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema'; // Assuming schema.ts is in the same directory or adjust path
import crypto from 'crypto'; 
import { eq, and, desc } from 'drizzle-orm';

// --- Database Setup ---
// NOTE: Consider moving DB setup to a shared lib file later for DRY principle
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[beans.ts:Init:Error] FATAL: DATABASE_URL missing.');
  throw new Error('DATABASE_URL environment variable is not set.');
}

let db: ReturnType<typeof drizzle>;
let sql: ReturnType<typeof neon>;

try {
    sql = neon(connectionString);
    db = drizzle(sql, { schema, logger: process.env.NODE_ENV !== 'production' }); // Enable logger in dev
    console.log('[beans.ts:Init] DB Client Initialized');
} catch (initError) {
    console.error('[beans.ts:Init:Error] DB initialization failed:', initError);
    // DB will be undefined, handler should check and return error
}
// --- End Database Setup ---


// --- JWT Verification Helper (Manual) ---
// NOTE: Consider moving JWT helpers to a shared lib file later
const JWT_SECRET = process.env.JWT_SECRET;

// Function to convert Base64 string to Uint8Array (Node.js compatible)
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary_string = Buffer.from(base64, 'base64').toString('binary');
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
};

function verifyJwt(token: string, secret: string): { [key: string]: any } | null {
     try {
        const [encodedHeader, encodedPayload, signature] = token.split('.');
        if (!encodedHeader || !encodedPayload || !signature) return null;

        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(`${encodedHeader}.${encodedPayload}`);
        const calculatedSignature = hmac.digest('base64url');

        if (calculatedSignature !== signature) {
            console.warn('[beans.ts:Auth:Verify] Invalid JWT signature');
            return null; 
        }

        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

        if (payload.exp && Date.now() / 1000 > payload.exp) {
            console.warn('[beans.ts:Auth:Verify] JWT expired');
            throw new Error('JwtTokenExpired'); 
        }

        return payload;
    } catch (error) {
        console.error('[beans.ts:Auth:Verify] Error verifying JWT:', error);
        if (error instanceof Error && error.message === 'JwtTokenExpired') throw error; 
        return null;
    }
}

async function verifyAuthToken(req: any): Promise<{ userId: string | null; error?: string; status?: number }> {
  const authHeader = req.headers['authorization'];
  if (!JWT_SECRET) {
    console.error('[beans.ts:Auth:Error] JWT_SECRET missing');
    return { userId: null, error: 'Internal Server Error: Configuration missing', status: 500 };
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, error: 'Unauthorized: Missing or invalid token format', status: 401 };
  }
  const token = authHeader.substring(7);
  try {
    const payload = verifyJwt(token, JWT_SECRET); 
    if (!payload || !payload.userId) {
      return { userId: null, error: 'Unauthorized: Invalid token payload', status: 401 };
    }
    console.log(`[beans.ts:Auth:Success] Verified token for user: ${payload.userId}`);
    return { userId: payload.userId as string }; 
  } catch (error) {
    console.error('[beans.ts:Auth:Error] Token verification failed:', error);
    const isExpired = error instanceof Error && error.message === 'JwtTokenExpired'; 
    return { userId: null, error: isExpired ? 'Unauthorized: Token expired' : 'Unauthorized: Invalid token', status: 401 };
  }
}
// --- End JWT Verification Helper ---


// --- Vercel Request Handler for GET /api/beans ---
export default async (req: any, res: any) => {
    // Only handle GET requests
    if (req.method !== 'GET') {
        console.log(`[beans.ts] Method ${req.method} not allowed`);
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    console.log('[beans.ts] GET handler invoked');

    // --- Auth Check ---
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        console.log(`[beans.ts:AuthFail] ${authResult.status} ${authResult.error}`);
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    const userId = authResult.userId;
    // --- End Auth Check ---

    // Check if DB is initialized (handle potential init error)
    if (!db) {
        console.error('[beans.ts:Error] DB client was not initialized.');
        return res.status(500).json({ status: 'error', message: 'Database client failed to initialize' });
    }

    try {
        console.log(`[beans.ts] Fetching beans for user: ${userId}`);
        const beans = await db.select()
          .from(schema.beansTable)
          .where(eq(schema.beansTable.userId, userId))
          .orderBy(schema.beansTable.createdAt);

        console.log(`[beans.ts] Found ${beans.length} beans for user: ${userId}`);
        
        // Set CORS headers for the response
        res.setHeader('Access-Control-Allow-Origin', '*'); 

        return res.status(200).json(beans);

    } catch (error) {
        console.error('[beans.ts:Error] Error fetching beans:', error);
        res.setHeader('Access-Control-Allow-Origin', '*'); // Also set CORS on error
        return res.status(500).json({ 
            status: 'error', 
            message: 'Internal Server Error fetching beans', 
            details: error instanceof Error ? error.message : String(error) 
        });
    }
};

// No Hono, No Edge Runtime specifier 