// api/ping-db.ts

import * as schema from './schema'; // Adjust path
// Import shared DB instance
import { db } from '../lib/db'; // Adjust path

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
    // Use imported db
    if (!db) { 
        console.error('[ping-db.ts:Error] DB client not available from lib.');
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