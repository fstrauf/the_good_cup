// api/beans.ts - Handles GET /api/beans

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema'; // Adjust path
import crypto from 'crypto'; // Keep for verifyAuthToken if used
import { eq, and, desc } from 'drizzle-orm';

// Import shared DB instance
import { db } from '../lib/db'; // Adjust path
// Import shared auth checker
import { verifyAuthToken } from '../lib/auth'; // Adjust path

// --- Vercel Request Handler for GET /api/beans ---
export default async (req: any, res: any) => {
    // Only handle GET requests
    if (req.method !== 'GET') {
        console.log(`[beans.ts] Method ${req.method} not allowed`);
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    console.log('[beans.ts] GET handler invoked');

    // --- Auth Check (using shared lib) ---
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        console.log(`[beans.ts:AuthFail] ${authResult.status} ${authResult.error}`);
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    const userId = authResult.userId;
    // --- End Auth Check ---

    // Check if DB is initialized (handle potential init error in lib/db.ts)
    if (!db) {
        console.error('[beans.ts:Error] DB client is not available from lib/db.ts');
        return res.status(500).json({ status: 'error', message: 'Database client failed to initialize' });
    }

    try {
        console.log(`[beans.ts] Fetching beans for user: ${userId}`);
        // Use imported db instance
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
// REMOVE local DB setup and local auth helpers 