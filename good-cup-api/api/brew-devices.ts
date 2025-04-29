// api/brew-devices.ts - Handles GET, POST, PUT, DELETE
import * as schema from './schema'; 
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db'; 
import { verifyAuthToken } from '../lib/auth'; 
import { getBodyJSON } from '../lib/utils'; 

export default async (req: any, res: any) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Add PUT, DELETE
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    // Auth
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    const userId = authResult.userId;

    // DB Check
    if (!db) return res.status(500).json({ message: 'DB not initialized' });

    // Get ID from query, if present
    const { id: deviceId } = req.query; // Use deviceId to match original code

    // --- Routes WITHOUT ID (/api/brew-devices) ---
    if (!deviceId) { 
        // --- GET /api/brew-devices ---
        if (req.method === 'GET') {
            console.log('[brew-devices.ts] GET all invoked');
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
            return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/brew-devices` });
        }
    }
    // --- Routes WITH ID (/api/brew-devices/[id]) ---
    else {
        if (typeof deviceId !== 'string') { // Explicit check
            return res.status(400).json({ message: 'Missing or invalid device ID in URL' });
        }

        // --- PUT /api/brew-devices/[id] ---
        if (req.method === 'PUT') {
             console.log(`[brew-devices.ts] PUT invoked for ID: ${deviceId}`);
             try {
                const { name, type, notes } = await getBodyJSON(req);
                if (!name || typeof name !== 'string') {
                    return res.status(400).json({ message: 'Device name is required' });
                }
                const updatedDevice = await db.update(schema.brewDevicesTable)
                    .set({ name: name, type: type || null, notes: notes || null, updatedAt: new Date() })
                    .where(and(eq(schema.brewDevicesTable.id, deviceId), eq(schema.brewDevicesTable.userId, userId)))
                    .returning();
                if (updatedDevice.length === 0) {
                    return res.status(404).json({ message: 'Brew device not found or update failed (check ID and ownership)' });
                }
                return res.status(200).json(updatedDevice[0]);
            } catch (error) {
                console.error(`[brew-devices.ts:PUT:Error] ID: ${deviceId}`, error);
                 if (error instanceof Error && error.message.includes('Invalid JSON')) {
                    return res.status(400).json({ message: error.message });
                }
                return res.status(500).json({ message: 'Internal Server Error updating brew device' });
            }
        }
        // --- DELETE /api/brew-devices/[id] ---
        else if (req.method === 'DELETE') {
            console.log(`[brew-devices.ts] DELETE invoked for ID: ${deviceId}`);
            try {
                const deletedDevice = await db.delete(schema.brewDevicesTable)
                    .where(and(eq(schema.brewDevicesTable.id, deviceId), eq(schema.brewDevicesTable.userId, userId)))
                    .returning({ id: schema.brewDevicesTable.id });
                if (deletedDevice.length === 0) {
                    return res.status(404).json({ message: 'Brew device not found or delete failed (check ID and ownership)' });
                }
                return res.status(200).json({ message: 'Brew device deleted successfully' });
            } catch (error) {
                console.error(`[brew-devices.ts:DELETE:Error] ID: ${deviceId}`, error);
                return res.status(500).json({ message: 'Internal Server Error deleting brew device' });
            }
        }
        // --- Method Not Allowed ---
        else {
            res.setHeader('Allow', ['PUT', 'DELETE']);
            return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/brew-devices/${deviceId}` });
        }
    }
}; 