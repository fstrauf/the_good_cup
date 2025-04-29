// Minimal Vercel Function for DB Ping Test

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
// Keep schema import for a simple typed query
import * as schema from './schema';
// Remove Hono verify import
// import { verify } from 'hono/jwt'; 
// Add Node.js crypto import
import crypto from 'crypto'; 
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

// --- Web Crypto Helper Functions (keep as is) ---
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

// Function to convert ArrayBuffer to Base64 string (Node.js compatible)
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  return Buffer.from(buffer).toString('base64');
};

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

// Function to hash password using PBKDF2 with Web Crypto (should work in Node >= 16)
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_LENGTH_BYTES * 8 // length in bits
  );
  const saltBase64 = arrayBufferToBase64(salt);
  const hashBase64 = arrayBufferToBase64(hashBuffer);
  return `${saltBase64}$${hashBase64}`; 
}

// Function to verify password against stored hash (using crypto.subtle)
async function verifyPassword(password: string, storedHashString: string): Promise<boolean> {
  try {
        const [saltBase64, storedHashBase64] = storedHashString.split('$');
        if (!saltBase64 || !storedHashBase64) {
            console.error('[Auth:Error] Invalid stored hash format');
            return false;
        }
        const salt = base64ToUint8Array(saltBase64);
        const storedHash = base64ToUint8Array(storedHashBase64);

        const passwordKey = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );
        const derivedHashBuffer = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256',
            },
            passwordKey,
            storedHash.length * 8 // Use stored hash length for bits
        );
        const derivedHash = new Uint8Array(derivedHashBuffer);

        // Constant-time comparison
        if (derivedHash.length !== storedHash.length) return false;
        let diff = 0;
        for (let i = 0; i < derivedHash.length; i++) {
            diff |= derivedHash[i] ^ storedHash[i];
        }
        return diff === 0;
    } catch (error) {
        console.error('[Auth:Error] Password verification error:', error);
        return false;
    }
}
// --- End Web Crypto Helper Functions ---

// --- JWT Creation Helper (Manual) ---
const JWT_SECRET = process.env.JWT_SECRET;
function createJwt(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${encodedHeader}.${encodedPayload}`);
  const signature = hmac.digest('base64url');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
// --- End JWT Creation Helper ---

// --- JWT Verification Helper (Manual) ---
// We need a verification function that doesn't rely on Hono
function verifyJwt(token: string, secret: string): { [key: string]: any } | null {
    try {
        const [encodedHeader, encodedPayload, signature] = token.split('.');
        if (!encodedHeader || !encodedPayload || !signature) return null;

        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(`${encodedHeader}.${encodedPayload}`);
        const calculatedSignature = hmac.digest('base64url');

        if (calculatedSignature !== signature) {
            console.warn('[Auth:Verify] Invalid JWT signature');
            return null; // Invalid signature
        }

        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

        // Check expiry
        if (payload.exp && Date.now() / 1000 > payload.exp) {
            console.warn('[Auth:Verify] JWT expired');
            // Optionally throw specific error or return null/flag
            throw new Error('JwtTokenExpired'); // Mimic hono/jwt error name
        }

        return payload;
    } catch (error) {
        console.error('[Auth:Verify] Error verifying JWT:', error);
        if (error instanceof Error && error.message === 'JwtTokenExpired') throw error; // Re-throw expiration error
        return null; // Malformed token or other error
    }
}

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
    // Use manual verifyJwt function
    const payload = verifyJwt(token, JWT_SECRET); 
    if (!payload || !payload.userId) {
      return { userId: null, error: 'Unauthorized: Invalid token payload', status: 401 };
    }
    console.log(`[Auth:Success] Verified token for user: ${payload.userId}`);
    return { userId: payload.userId as string }; // Success
  } catch (error) {
    console.error('[Auth:Error] Token verification failed:', error);
    // Check specific error name set in verifyJwt
    const isExpired = error instanceof Error && error.message === 'JwtTokenExpired'; 
    return { userId: null, error: isExpired ? 'Unauthorized: Token expired' : 'Unauthorized: Invalid token', status: 401 };
  }
}
// --- End JWT Verification Helper ---

// --- Request Body Parser ---
async function getBodyJSON(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}')); // Return empty object if body is empty
            } catch (e) {
                console.error('[BodyParse:Error] Invalid JSON:', e);
                reject(new Error('Invalid JSON in request body'));
            }
        });
        req.on('error', (err: Error) => {
            console.error('[BodyParse:Error] Request error:', err);
            reject(err);
        });
    });
}
// --- End Request Body Parser ---

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Define email regex

// --- Vercel Request Handler ---
export default async (req: any, res: any) => {
  // Handle CORS OPTIONS requests first
  if (req.method === 'OPTIONS') {
    console.log(`[Request] OPTIONS ${req.url}`);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust origin for production
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Add POST
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  // Set CORS for actual requests too
  res.setHeader('Access-Control-Allow-Origin', '*');

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

  // --- Register Route --- 
  else if (path === '/api/auth/register' && method === 'POST') {
    console.log('[Handler:/api/auth/register] POST handler invoked');
    if (!db) return res.status(500).json({ message: 'DB not initialized' });

    try {
        const { email, password, name } = await getBodyJSON(req);
        
        // Validation
        if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
          return res.status(400).json({ message: 'Invalid email format.' });
        }
        if (!password || typeof password !== 'string' || password.length < 8) {
          return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
        }
        if (name && typeof name !== 'string') {
          return res.status(400).json({ message: 'Invalid name format.' });
        }

        // Check existing user
        const existingUsers = await db.select({ email: schema.usersTable.email })
                                    .from(schema.usersTable)
                                    .where(eq(schema.usersTable.email, email.toLowerCase()))
                                    .limit(1);
        if (existingUsers.length > 0) {
          return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Insert user
        const insertedUsers = await db.insert(schema.usersTable)
                                    .values({
                                        email: email.toLowerCase(),
                                        passwordHash: passwordHash,
                                        name: name || null,
                                    })
                                    .returning({ 
                                        id: schema.usersTable.id,
                                        email: schema.usersTable.email,
                                        name: schema.usersTable.name
                                    });

        if (insertedUsers.length === 0) throw new Error('Failed to insert user.');
        const newUser = insertedUsers[0];

        return res.status(201).json({ 
            message: 'User registered successfully.', 
            user: newUser
        });

    } catch (error) {
        console.error('[Handler:/api/auth/register:Error]', error);
        // Handle JSON parsing errors specifically
        if (error instanceof Error && error.message.includes('Invalid JSON')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Internal Server Error during registration' });
    } 
  }

  // --- Login Route --- 
  else if (path === '/api/auth/login' && method === 'POST') {
      console.log('[Handler:/api/auth/login] POST handler invoked');
      if (!db) return res.status(500).json({ message: 'DB not initialized' });
      if (!JWT_SECRET) return res.status(500).json({ message: 'JWT Secret not configured' });

      try {
          const { email, password } = await getBodyJSON(req);

          // Validation
          if (!email || typeof email !== 'string') {
              return res.status(400).json({ message: 'Email is required.' });
          }
          if (!password || typeof password !== 'string') {
              return res.status(400).json({ message: 'Password is required.' });
          }

          // Find user
          const foundUsers = await db.select()
                                  .from(schema.usersTable)
                                  .where(eq(schema.usersTable.email, email.toLowerCase()))
                                  .limit(1);
          if (foundUsers.length === 0) {
              return res.status(401).json({ message: 'Invalid email or password.' });
          }
          const user = foundUsers[0];

          // Verify password
          const passwordMatches = await verifyPassword(password, user.passwordHash);
          if (!passwordMatches) {
              return res.status(401).json({ message: 'Invalid email or password.' });
          }

          // Create JWT
          const tokenPayload = {
              userId: user.id,
              email: user.email,
              exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
          };
          const token = createJwt(tokenPayload, JWT_SECRET);

          return res.status(200).json({
              token,
              user: {
                  id: user.id,
                  email: user.email,
                  name: user.name,
              },
          });

      } catch (error) {
          console.error('[Handler:/api/auth/login:Error]', error);
          if (error instanceof Error && error.message.includes('Invalid JSON')) {
              return res.status(400).json({ message: error.message });
          }
          return res.status(500).json({ message: 'Internal Server Error during login' });
      }
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