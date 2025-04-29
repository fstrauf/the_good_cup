// api/settings.ts - Handles GET and PUT for user settings

import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../lib/db'; // Adjust path as needed
import { userSettingsTable } from './schema'; // Adjust path as needed
import { eq } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Adjust path as needed

export default async (req: VercelRequest, res: VercelResponse) => {
    // --- CORS Handling ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS'); // Only GET and PUT
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // --- Authentication ---
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            if (!JWT_SECRET) {
                console.error("Auth error: JWT_SECRET missing");
                return res.status(500).json({ message: 'Server configuration error' });
            }
            const decoded = verifyJwt(token, JWT_SECRET);
            if (!decoded || !decoded.userId) {
                return res.status(401).json({ message: 'Invalid token payload' });
            }
            userId = decoded.userId as string;
        } catch (error) {
            console.error("Token verification failed:", error);
            const isExpired = error instanceof Error && error.message === 'JwtTokenExpired';
            return res.status(401).json({ message: isExpired ? 'Token expired' : 'Invalid or expired token' });
        }
    } else {
        return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }

    if (!userId) {
        return res.status(401).json({ message: 'Could not verify user identity' });
    }
    
    // --- DB Check ---
    if (!db) {
        console.error('[settings.ts] DB client not initialized.');
        return res.status(500).json({ message: 'Database client failed to initialize' });
    }

    // --- Route Logic based on Method ---
    try {
        if (req.method === 'GET') {
            // --- GET /api/settings (Get User Settings) ---
            const settings = await db.select()
                .from(userSettingsTable)
                .where(eq(userSettingsTable.userId, userId))
                .limit(1);
            // Return empty object if no settings found
            return res.status(200).json(settings[0] || {}); 

        } else if (req.method === 'PUT') {
            // --- PUT /api/settings (Update/Create User Settings - Upsert) ---
            const { defaultBrewDeviceId, defaultGrinderId }: { defaultBrewDeviceId?: string | null; defaultGrinderId?: string | null } = req.body || {};

            // Basic validation
            if (defaultBrewDeviceId === undefined && defaultGrinderId === undefined) {
                return res.status(400).json({ message: 'No settings provided to update' });
            }
             // More specific validation (ensure IDs are strings or null)
             if (defaultBrewDeviceId !== undefined && typeof defaultBrewDeviceId !== 'string' && defaultBrewDeviceId !== null) {
                 return res.status(400).json({ message: 'Invalid format for defaultBrewDeviceId' });
             }
             if (defaultGrinderId !== undefined && typeof defaultGrinderId !== 'string' && defaultGrinderId !== null) {
                 return res.status(400).json({ message: 'Invalid format for defaultGrinderId' });
             }

            const dataToUpsert = {
                userId: userId,
                defaultBrewDeviceId: defaultBrewDeviceId, // Handles null if passed
                defaultGrinderId: defaultGrinderId,   // Handles null if passed
                updatedAt: new Date(),
            };

            const updatedSettings = await db.insert(userSettingsTable)
                .values(dataToUpsert)
                .onConflictDoUpdate({ target: userSettingsTable.userId, set: dataToUpsert })
                .returning();

            if (!updatedSettings || updatedSettings.length === 0) {
                throw new Error("Failed to upsert settings.");
            }
            return res.status(200).json(updatedSettings[0]);

        } else {
            // Method Not Allowed
            res.setHeader('Allow', ['GET', 'PUT']);
            return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/settings` });
        }
    } catch (error: any) {
        console.error(`[settings.ts] Error (${req.method} ${req.url}):`, error);
        const errorMessage = process.env.NODE_ENV === 'production' 
            ? 'Internal Server Error' 
            : error instanceof Error ? error.message : String(error);
        return res.status(500).json({ 
            message: 'Internal Server Error', 
            details: errorMessage
        });
    }
}; 