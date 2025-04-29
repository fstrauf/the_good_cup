// api/ping-db.ts

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema'; // Adjust path

// --- Database Setup ---
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[ping-db.ts:Init:Error] FATAL: DATABASE_URL missing.');
  throw new Error('DATABASE_URL environment variable is not set.');
}
let db: ReturnType<typeof drizzle>;
try {
    const sql = neon(connectionString);
    db = drizzle(sql, { schema, logger: process.env.NODE_ENV !== 'production' });
    console.log('[ping-db.ts:Init] DB Client Initialized');
} catch (initError) {
    console.error('[ping-db.ts:Init:Error] DB initialization failed:', initError);
}
// --- End Database Setup ---

// --- Vercel Request Handler for GET /api/ping-db ---
export default async (req: any, res: any) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }

    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    console.log('[ping-db.ts] GET handler invoked');
    if (!db) {
        console.error('[ping-db.ts:Error] DB client was not initialized.');
        return res.status(500).json({ status: 'error', message: 'Database client failed to initialize' });
    }
    
    try {
        console.log('[ping-db.ts] Attempting simple DB query...');
        const result = await db.select({ id: schema.usersTable.id })
                           .from(schema.usersTable)
                           .limit(1);
        console.log('[ping-db.ts] DB query successful:', result);
        return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        console.error('[ping-db.ts:Error] Error during DB ping query:', error);
        return res.status(500).json({ 
            status: 'error', 
            message: 'DB query failed', 
            details: error instanceof Error ? error.message : String(error) 
        });
    }
}; 