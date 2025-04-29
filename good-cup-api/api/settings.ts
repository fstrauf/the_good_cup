// api/settings.ts

import * as schema from './schema'; // Adjust path
import { eq } from 'drizzle-orm';
import { db } from '../lib/db'; // Adjust path
import { verifyAuthToken } from '../lib/auth'; // Adjust path
import { getBodyJSON } from '../lib/utils'; // Adjust path

export default async (req: any, res: any) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    // Auth Check for all methods
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    const userId = authResult.userId;

    // Check DB
    if (!db) return res.status(500).json({ message: 'DB not initialized' });

    // --- GET /api/settings ---
    if (req.method === 'GET') {
        console.log('[settings.ts] GET handler invoked');
        try {
            const settings = await db.select({
                defaultBrewDeviceId: schema.userSettingsTable.defaultBrewDeviceId,
                defaultGrinderId: schema.userSettingsTable.defaultGrinderId
            })
            .from(schema.userSettingsTable)
            .where(eq(schema.userSettingsTable.userId, userId))
            .limit(1);

            return res.status(200).json(settings[0] || { defaultBrewDeviceId: null, defaultGrinderId: null });
        
        } catch (error) {
            console.error('[settings.ts:GET:Error]', error);
            return res.status(500).json({ message: 'Internal Server Error fetching settings' });
        }
    }

    // --- PUT /api/settings ---
    else if (req.method === 'PUT') {
        console.log('[settings.ts] PUT handler invoked');
        try {
            const { defaultBrewDeviceId, defaultGrinderId } = await getBodyJSON(req);

            // Validation
            if (defaultBrewDeviceId !== null && typeof defaultBrewDeviceId !== 'string') {
                return res.status(400).json({ message: 'Invalid format for defaultBrewDeviceId' });
            }
            if (defaultGrinderId !== null && typeof defaultGrinderId !== 'string') {
                return res.status(400).json({ message: 'Invalid format for defaultGrinderId' });
            }

            const upsertedSettings = await db.insert(schema.userSettingsTable)
                .values({
                    userId: userId,
                    defaultBrewDeviceId: defaultBrewDeviceId || null,
                    defaultGrinderId: defaultGrinderId || null,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({ 
                    target: schema.userSettingsTable.userId,
                    set: {
                        defaultBrewDeviceId: defaultBrewDeviceId || null,
                        defaultGrinderId: defaultGrinderId || null,
                        updatedAt: new Date(),
                    }
                })
                .returning({
                    userId: schema.userSettingsTable.userId,
                    defaultBrewDeviceId: schema.userSettingsTable.defaultBrewDeviceId,
                    defaultGrinderId: schema.userSettingsTable.defaultGrinderId
                });
            
            if (upsertedSettings.length === 0) throw new Error('Failed to upsert settings');
            return res.status(200).json(upsertedSettings[0]);

        } catch (error) {
            console.error('[settings.ts:PUT:Error]', error);
            if (error instanceof Error && error.message.includes('Invalid JSON')) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: 'Internal Server Error updating settings' });
        }
    }

    // --- Method Not Allowed ---
    else {
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
}; 