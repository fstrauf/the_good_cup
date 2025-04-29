import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../schema'; // Adjust path
import crypto from 'crypto'; 
import { eq } from 'drizzle-orm';

// --- Database Setup ---
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[login.ts:Init:Error] FATAL: DATABASE_URL missing.');
  throw new Error('DATABASE_URL environment variable is not set.');
}
let db: ReturnType<typeof drizzle>;
try {
    const sql = neon(connectionString);
    db = drizzle(sql, { schema, logger: process.env.NODE_ENV !== 'production' });
    console.log('[login.ts:Init] DB Client Initialized');
} catch (initError) {
    console.error('[login.ts:Init:Error] DB initialization failed:', initError);
}
// --- End Database Setup ---

// --- Password Verification Helpers ---
const PBKDF2_ITERATIONS = 100000;
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary_string = Buffer.from(base64, 'base64').toString('binary');
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
  return bytes;
};

async function verifyPassword(password: string, storedHashString: string): Promise<boolean> {
   try {
        const [saltBase64, storedHashBase64] = storedHashString.split('$');
        if (!saltBase64 || !storedHashBase64) { console.error('[login.ts:Auth:Error] Invalid hash format'); return false; }
        const salt = base64ToUint8Array(saltBase64);
        const storedHash = base64ToUint8Array(storedHashBase64);
        const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
        const derivedHashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, passwordKey, storedHash.length * 8);
        const derivedHash = new Uint8Array(derivedHashBuffer);
        if (derivedHash.length !== storedHash.length) return false;
        let diff = 0;
        for (let i = 0; i < derivedHash.length; i++) { diff |= derivedHash[i] ^ storedHash[i]; }
        return diff === 0;
    } catch (error) {
        console.error('[login.ts:Auth:Error] Password verification error:', error);
        return false;
    }
}
// --- End Password Verification Helpers ---

// --- JWT Creation Helper ---
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

// --- Request Body Parser ---
async function getBodyJSON(req: any): Promise<any> {
    // ... (Same implementation as before)
     return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch (e) { console.error('[login.ts:BodyParse:Error]', e); reject(new Error('Invalid JSON')); }
        });
        req.on('error', (err: Error) => { console.error('[login.ts:ReqError]', err); reject(err); });
    });
}
// --- End Request Body Parser ---

// --- Vercel Request Handler for POST /api/auth/login ---
export default async (req: any, res: any) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    console.log('[login.ts] POST handler invoked');
    if (!db) return res.status(500).json({ message: 'DB not initialized' });
    if (!JWT_SECRET) return res.status(500).json({ message: 'JWT Secret not configured' });

    try {
        const { email, password } = await getBodyJSON(req);

        // Validation (copied from index.ts)
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
        console.error('[login.ts:Error]', error);
        if (error instanceof Error && error.message.includes('Invalid JSON')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Internal Server Error during login' });
    }
}; 