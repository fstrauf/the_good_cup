import * as schema from '../schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { verifyAuthToken } from '../auth';
import type { Context } from 'hono';

// --- GET /api/settings ---
export async function handleGetSettings(c: Context) {
    console.log('[settingsHandler] GET handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const settings = await db.select()
                             .from(schema.userSettingsTable)
                             .where(eq(schema.userSettingsTable.userId, authResult.userId))
                             .limit(1);

    if (settings.length === 0) {
        // If no settings exist, return defaults or an empty object structure
        console.log(`[settingsHandler] No settings found for user ${authResult.userId}, returning defaults.`);
        return {
            userId: authResult.userId,
            defaultBrewDeviceId: null,
            defaultGrinderId: null,
        };
    }
    return settings[0];
}

// --- PUT /api/settings ---
export async function handleUpdateSettings(c: Context) {
    console.log('[settingsHandler] PUT handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const body = await c.req.json();

    // Validate that at least one setting is being provided
    if (body.defaultBrewDeviceId === undefined && body.defaultGrinderId === undefined) {
        throw { status: 400, message: 'No settings provided to update.' };
    }

    // Prepare update data - allow null values explicitly
    const updateData: { defaultBrewDeviceId?: string | null; defaultGrinderId?: string | null } = {};
    if (body.defaultBrewDeviceId !== undefined) {
        updateData.defaultBrewDeviceId = body.defaultBrewDeviceId;
    }
    if (body.defaultGrinderId !== undefined) {
        updateData.defaultGrinderId = body.defaultGrinderId;
    }

    // Use upsert logic: Update if exists, Insert if not
    // Drizzle's `onConflictDoUpdate` is suitable here
    const result = await db.insert(schema.userSettingsTable)
                           .values({ 
                                userId: authResult.userId, 
                                defaultBrewDeviceId: updateData.defaultBrewDeviceId !== undefined ? updateData.defaultBrewDeviceId : null,
                                defaultGrinderId: updateData.defaultGrinderId !== undefined ? updateData.defaultGrinderId : null,
                            })
                           .onConflictDoUpdate({ 
                                target: schema.userSettingsTable.userId, // Conflict target is the userId primary key
                                set: updateData // Fields to update on conflict
                            })
                           .returning();

    if (result.length === 0) throw { status: 500, message: 'Failed to update settings' };
    return result[0];
} 