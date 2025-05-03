import * as schema from '../schema'; // Correct path relative to lib/
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { verifyAuthToken } from '../auth';
import { getBodyJSON } from '../utils';
import { URL, URLSearchParams } from 'url';

// --- GET /api/brew-devices ---
export async function handleGetBrewDevices(req: any, res: any) {
    console.log('[brewDeviceHandler] GET handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const devices = await db.select()
                           .from(schema.brewDevicesTable)
                           .where(eq(schema.brewDevicesTable.userId, authResult.userId));
    return devices; 
}

// --- POST /api/brew-devices ---
export async function handleAddBrewDevice(req: any, res: any) {
    console.log('[brewDeviceHandler] POST handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const { name, type, notes } = await getBodyJSON(req);
    if (!name || typeof name !== 'string') throw { status: 400, message: 'Device name is required.' };
    
    const newDeviceData = {
        userId: authResult.userId,
        name,
        type: type || null,
        notes: notes || null,
    };
    
    const result = await db.insert(schema.brewDevicesTable)
                           .values(newDeviceData)
                           .returning();
                           
    if (result.length === 0) throw { status: 500, message: 'Failed to create brew device' };
    return result[0];
}

// --- PUT /api/brew-devices?id={id} ---
export async function handleUpdateBrewDevice(req: any, res: any) {
    console.log('[brewDeviceHandler] PUT handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const host = req.headers['host'] || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = `${protocol}://${host}${req.url || '/'}`;
    const url = new URL(fullUrl);
    const deviceId = url.searchParams.get('id');
    if (!deviceId) throw { status: 400, message: 'Device ID is required in query parameters.' };

    const { name, type, notes } = await getBodyJSON(req);
    if (!name || typeof name !== 'string') throw { status: 400, message: 'Device name is required.' };
    
    const updateData = {
        name,
        type: type !== undefined ? type : null, 
        notes: notes !== undefined ? notes : null,
    };

    const result = await db.update(schema.brewDevicesTable)
                           .set(updateData)
                           .where(eq(schema.brewDevicesTable.id, deviceId) && eq(schema.brewDevicesTable.userId, authResult.userId))
                           .returning();

    if (result.length === 0) throw { status: 404, message: 'Device not found or user unauthorized.' };
    return result[0];
}

// --- DELETE /api/brew-devices?id={id} ---
export async function handleDeleteBrewDevice(req: any, res: any) {
    console.log('[brewDeviceHandler] DELETE handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const host = req.headers['host'] || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = `${protocol}://${host}${req.url || '/'}`;
    const url = new URL(fullUrl);
    const deviceId = url.searchParams.get('id');
    if (!deviceId) throw { status: 400, message: 'Device ID is required in query parameters.' };

    const deleteResult = await db.delete(schema.brewDevicesTable)
                                 .where(eq(schema.brewDevicesTable.id, deviceId) && eq(schema.brewDevicesTable.userId, authResult.userId));

    if (deleteResult.rowCount === 0) {
        console.warn(`[brewDeviceHandler] Device ${deviceId} not found for user ${authResult.userId} or already deleted.`);
    } else {
         console.log(`[brewDeviceHandler] Successfully deleted device ${deviceId} for user ${authResult.userId}`);
    }
    
    return { message: 'Brew device deleted successfully' };
} 