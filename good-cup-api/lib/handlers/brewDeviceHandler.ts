import * as schema from '../schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { verifyAuthToken } from '../auth';
import type { Context } from 'hono';

// --- GET /api/brew-devices ---
export async function handleGetBrewDevices(c: Context) {
    console.log('[brewDeviceHandler] GET handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const devices = await db.select()
                           .from(schema.brewDevicesTable)
                           .where(eq(schema.brewDevicesTable.userId, authResult.userId));
    return devices; 
}

// --- POST /api/brew-devices ---
export async function handleAddBrewDevice(c: Context) {
    console.log('[brewDeviceHandler] POST handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const body = await c.req.json();
    if (!body.name || typeof body.name !== 'string') throw { status: 400, message: 'Device name is required.' };
    
    const newDeviceData = {
        userId: authResult.userId,
        name: body.name,
        type: body.type || null,
        notes: body.notes || null,
    };
    
    const result = await db.insert(schema.brewDevicesTable)
                           .values(newDeviceData)
                           .returning();
                           
    if (result.length === 0) throw { status: 500, message: 'Failed to create brew device' };
    return result[0];
}

// --- PUT /api/brew-devices?id={id} ---
export async function handleUpdateBrewDevice(c: Context) {
    console.log('[brewDeviceHandler] PUT handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const deviceId = c.req.query('id');
    if (!deviceId) throw { status: 400, message: 'Device ID is required in query parameters.' };

    const body = await c.req.json();
    if (!body.name || typeof body.name !== 'string') throw { status: 400, message: 'Device name is required.' };
    
    const updateData = {
        name: body.name,
        type: body.type !== undefined ? body.type : null, 
        notes: body.notes !== undefined ? body.notes : null,
    };

    const result = await db.update(schema.brewDevicesTable)
                           .set(updateData)
                           .where(eq(schema.brewDevicesTable.id, deviceId) && eq(schema.brewDevicesTable.userId, authResult.userId))
                           .returning();

    if (result.length === 0) throw { status: 404, message: 'Device not found or user unauthorized.' };
    return result[0];
}

// --- DELETE /api/brew-devices?id={id} ---
export async function handleDeleteBrewDevice(c: Context) {
    console.log('[brewDeviceHandler] DELETE handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const deviceId = c.req.query('id');
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