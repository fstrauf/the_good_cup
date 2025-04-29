import * as schema from '../schema'; // Adjust path
import { eq, and } from 'drizzle-orm';
import { db } from '../../lib/db'; // Adjust path
import { verifyAuthToken } from '../../lib/auth'; // Adjust path
import { getBodyJSON } from '../../lib/utils'; // Adjust path

export default async (req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    const userId = authResult.userId;

    // Extract ID from query parameters
    const { id: deviceId } = req.query;
    if (!deviceId || typeof deviceId !== 'string') {
         return res.status(400).json({ message: 'Missing or invalid device ID in URL' });
    }

    if (!db) return res.status(500).json({ message: 'DB not initialized' });

    // --- PUT /api/brew-devices/[id] ---
    if (req.method === 'PUT') {
         console.log(`[brew-devices/[id].ts] PUT invoked for ID: ${deviceId}`);
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
            console.error('[brew-devices/[id].ts:PUT:Error]', error);
             if (error instanceof Error && error.message.includes('Invalid JSON')) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: 'Internal Server Error updating brew device' });
        }
    }

    // --- DELETE /api/brew-devices/[id] ---
    else if (req.method === 'DELETE') {
        console.log(`[brew-devices/[id].ts] DELETE invoked for ID: ${deviceId}`);
        try {
            const deletedDevice = await db.delete(schema.brewDevicesTable)
                .where(and(eq(schema.brewDevicesTable.id, deviceId), eq(schema.brewDevicesTable.userId, userId)))
                .returning({ id: schema.brewDevicesTable.id });
            if (deletedDevice.length === 0) {
                return res.status(404).json({ message: 'Brew device not found or delete failed (check ID and ownership)' });
            }
            return res.status(200).json({ message: 'Brew device deleted successfully' });
        } catch (error) {
            console.error('[brew-devices/[id].ts:DELETE:Error]', error);
            return res.status(500).json({ message: 'Internal Server Error deleting brew device' });
        }
    }

    // --- Method Not Allowed ---
    else {
        res.setHeader('Allow', ['PUT', 'DELETE']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
}; 