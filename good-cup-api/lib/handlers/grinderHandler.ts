import * as schema from '../schema';
import { db } from '../db'; // Adjust path relative to lib/handlers/
import { eq } from 'drizzle-orm';
import { verifyAuthToken } from '../auth'; // Adjust path relative to lib/handlers/
import type { Context } from 'hono';

// --- GET /api/grinders ---
export async function handleGetGrinders(c: Context) {
    console.log('[grinderHandler] GET handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const grinders = await db.select()
                           .from(schema.grindersTable)
                           .where(eq(schema.grindersTable.userId, authResult.userId));
    return grinders; // Let router handle response
}

// --- POST /api/grinders ---
export async function handleAddGrinder(c: Context) {
    console.log('[grinderHandler] POST handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const body = await c.req.json();
    if (!body.name || typeof body.name !== 'string') throw { status: 400, message: 'Grinder name is required.' };
    
    const newGrinderData = {
        userId: authResult.userId,
        name: body.name,
        type: body.type || null,
        notes: body.notes || null,
    };
    
    const result = await db.insert(schema.grindersTable)
                           .values(newGrinderData)
                           .returning(); // Return the newly created grinder
                           
    if (result.length === 0) throw { status: 500, message: 'Failed to create grinder' };
    return result[0]; // Return the first (and only) inserted grinder
}

// --- PUT /api/grinders?id={id} ---
export async function handleUpdateGrinder(c: Context) {
    console.log('[grinderHandler] PUT handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const grinderId = c.req.query('id');
    if (!grinderId) throw { status: 400, message: 'Grinder ID is required in query parameters.' };

    const body = await c.req.json();
    if (!body.name || typeof body.name !== 'string') throw { status: 400, message: 'Grinder name is required.' };
    
    const updateData = {
        name: body.name,
        type: body.type !== undefined ? body.type : null, // Handle optional fields
        notes: body.notes !== undefined ? body.notes : null,
        // updatedAt: new Date() // Drizzle might handle this automatically depending on schema
    };

    const result = await db.update(schema.grindersTable)
                           .set(updateData)
                           .where(eq(schema.grindersTable.id, grinderId) && eq(schema.grindersTable.userId, authResult.userId))
                           .returning();

    if (result.length === 0) throw { status: 404, message: 'Grinder not found or user unauthorized.' };
    return result[0];
}

// --- DELETE /api/grinders?id={id} ---
export async function handleDeleteGrinder(c: Context) {
    console.log('[grinderHandler] DELETE handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const grinderId = c.req.query('id');
    if (!grinderId) throw { status: 400, message: 'Grinder ID is required in query parameters.' };

    const deleteResult = await db.delete(schema.grindersTable)
                                 .where(eq(schema.grindersTable.id, grinderId) && eq(schema.grindersTable.userId, authResult.userId));

    if (deleteResult.rowCount === 0) {
        console.warn(`[grinderHandler] Grinder ${grinderId} not found for user ${authResult.userId} or already deleted.`);
        // Consider throwing 404, but 200 is acceptable for DELETE idempotency
    } else {
         console.log(`[grinderHandler] Successfully deleted grinder ${grinderId} for user ${authResult.userId}`);
    }
    
    return { message: 'Grinder deleted successfully' };
} 