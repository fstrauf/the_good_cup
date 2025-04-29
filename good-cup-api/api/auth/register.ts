import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../schema'; // Adjust path based on actual location
import crypto from 'crypto'; 
import { eq } from 'drizzle-orm';

// --- Database Setup ---
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[register.ts:Init:Error] FATAL: DATABASE_URL missing.');
  throw new Error('DATABASE_URL environment variable is not set.');
}
let db: ReturnType<typeof drizzle>;
try {
    const sql = neon(connectionString);
    db = drizzle(sql, { schema, logger: process.env.NODE_ENV !== 'production' });
    console.log('[register.ts:Init] DB Client Initialized');
} catch (initError) {
    console.error('[register.ts:Init:Error] DB initialization failed:', initError);
}
// --- End Database Setup ---

// --- Password Hashing Helpers ---
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  return Buffer.from(buffer).toString('base64');
};

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
    KEY_LENGTH_BYTES * 8 
  );
  const saltBase64 = arrayBufferToBase64(salt);
  const hashBase64 = arrayBufferToBase64(hashBuffer);
  return `${saltBase64}$${hashBase64}`; 
}
// --- End Password Hashing Helpers ---

// --- Request Body Parser ---
async function getBodyJSON(req: any): Promise<any> {
    // ... (Same implementation as before)
     return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch (e) { console.error('[register.ts:BodyParse:Error]', e); reject(new Error('Invalid JSON')); }
        });
        req.on('error', (err: Error) => { console.error('[register.ts:ReqError]', err); reject(err); });
    });
}
// --- End Request Body Parser ---

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Vercel Request Handler for POST /api/auth/register ---
export default async (req: any, res: any) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }

    // Only handle POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    console.log('[register.ts] POST handler invoked');
    if (!db) return res.status(500).json({ message: 'DB not initialized' });

    try {
        const { email, password, name } = await getBodyJSON(req);
        
        // Validation (copied from index.ts)
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
        console.error('[register.ts:Error]', error);
        if (error instanceof Error && error.message.includes('Invalid JSON')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Internal Server Error during registration' });
    } 
}; 