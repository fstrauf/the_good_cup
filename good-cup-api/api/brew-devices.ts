// api/brew-devices.ts - Handles ALL CRUD operations for /api/brew-devices

import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../lib/db'; // Adjust path as needed
import { brewDevicesTable } from './schema'; // Adjust path as needed
import { eq, and } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Adjust path as needed

export default async (req: VercelRequest, res: VercelResponse) => {
    // --- CORS Handling ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
        console.error('[brew-devices.ts] DB client not initialized.');
        return res.status(500).json({ message: 'Database client failed to initialize' });
    }

    // --- Route Logic based on Method and Query ID ---
    const { id: deviceId } = req.query;

    try {
        // --- Operations WITHOUT ID (/api/brew-devices) ---
        if (!deviceId) {
            if (req.method === 'GET') {
                // --- GET /api/brew-devices (List Devices) ---
                const devices = await db.select().from(brewDevicesTable).where(eq(brewDevicesTable.userId, userId)).orderBy(brewDevicesTable.name);
                return res.status(200).json(devices);

            } else if (req.method === 'POST') {
                // --- POST /api/brew-devices (Add Device) ---
                const { name, type, notes }: { name?: string; type?: string | null; notes?: string | null } = req.body || {};
                if (!name) {
                    return res.status(400).json({ message: 'Device name is required' });
                }
                const dataToInsert = { name, type, notes, userId };
                const newDevice = await db.insert(brewDevicesTable).values(dataToInsert).returning();
                if (!newDevice || newDevice.length === 0) {
                    throw new Error("Failed to insert device.");
                }
                return res.status(201).json(newDevice[0]);
            } else {
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/brew-devices` });
            }
        }
        // --- Operations WITH ID (/api/brew-devices?id=...) ---
        else {
            if (typeof deviceId !== 'string') {
                 return res.status(400).json({ message: 'Invalid device ID format in query' });
            }

            if (req.method === 'GET') {
                // --- GET /api/brew-devices?id={deviceId} ---
                 const result = await db.select().from(brewDevicesTable).where(and(eq(brewDevicesTable.id, deviceId), eq(brewDevicesTable.userId, userId))).limit(1);
                 if (!result || result.length === 0) {
                    return res.status(404).json({ message: 'Device not found' });
                 }
                 return res.status(200).json(result[0]);

            } else if (req.method === 'PUT') {
                // --- PUT /api/brew-devices?id={deviceId} ---
                 const { name, type, notes }: { name?: string; type?: string | null; notes?: string | null } = req.body || {};
                 if (name === '') {
                    return res.status(400).json({ message: 'Device name cannot be empty' });
                 }
                 const dataToUpdate = { name, type, notes, updatedAt: new Date() };
                 const updatedDevice = await db.update(brewDevicesTable).set(dataToUpdate).where(and(eq(brewDevicesTable.id, deviceId), eq(brewDevicesTable.userId, userId))).returning();
                 if (!updatedDevice || updatedDevice.length === 0) {
                    return res.status(404).json({ message: 'Device not found or update failed' });
                 }
                 return res.status(200).json(updatedDevice[0]);

            } else if (req.method === 'DELETE') {
                // --- DELETE /api/brew-devices?id={deviceId} ---
                const deletedDevice = await db.delete(brewDevicesTable).where(and(eq(brewDevicesTable.id, deviceId), eq(brewDevicesTable.userId, userId))).returning();
                if (!deletedDevice || deletedDevice.length === 0) {
                    return res.status(404).json({ message: 'Device not found' });
                }
                return res.status(200).json({ message: 'Device deleted successfully' });

            } else {
                res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
                return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/brew-devices?id=${deviceId}` });
            }
        }
    } catch (error: any) {
        console.error(`[brew-devices.ts] Error (${req.method} ${req.url}):`, error);
        const errorMessage = process.env.NODE_ENV === 'production' 
            ? 'Internal Server Error' 
            : error instanceof Error ? error.message : String(error);
        return res.status(500).json({ 
            message: 'Internal Server Error', 
            details: errorMessage
        });
    }
}; 