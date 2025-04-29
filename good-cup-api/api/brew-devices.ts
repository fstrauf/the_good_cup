// api/brew-devices.ts
import * as schema from './schema'; 
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db'; 
import { verifyAuthToken } from '../lib/auth'; 
import { getBodyJSON } from '../lib/utils'; 

export default async (req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    const userId = authResult.userId;

    if (!db) return res.status(500).json({ message: 'DB not initialized' });

    // --- GET /api/brew-devices ---
    if (req.method === 'GET') {
        console.log('[brew-devices.ts] GET invoked');
        try {
            const devices = await db.select()
              .from(schema.brewDevicesTable)
              .where(eq(schema.brewDevicesTable.userId, userId))
              .orderBy(schema.brewDevicesTable.createdAt);
            return res.status(200).json(devices);
        } catch (error) {
            console.error('[brew-devices.ts:GET:Error]', error);
            return res.status(500).json({ message: 'Internal Server Error fetching brew devices' });
        }
    }

    // --- POST /api/brew-devices ---
    else if (req.method === 'POST') {
        console.log('[brew-devices.ts] POST invoked');
        try {
            const { name, type, notes } = await getBodyJSON(req);
            if (!name || typeof name !== 'string') {
                return res.status(400).json({ message: 'Device name is required' });
            }
            const newDevice = await db.insert(schema.brewDevicesTable)
                .values({ userId: userId, name: name, type: type || null, notes: notes || null })
                .returning();
            if (newDevice.length === 0) throw new Error('Failed to create brew device');
            return res.status(201).json(newDevice[0]);
        } catch (error) {
            console.error('[brew-devices.ts:POST:Error]', error);
            if (error instanceof Error && error.message.includes('Invalid JSON')) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: 'Internal Server Error creating brew device' });
        }
    }

    // --- Method Not Allowed ---
    else {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
}; 