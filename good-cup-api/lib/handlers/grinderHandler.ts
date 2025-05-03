import * as schema from '../schema'; // Correct path relative to lib/
import { db } from '../db'; // Adjust path relative to lib/handlers/
import { eq } from 'drizzle-orm';
import { verifyAuthToken } from '../auth'; // Adjust path relative to lib/handlers/
import { getBodyJSON } from '../utils'; // Adjust path relative to lib/handlers/
import { URL, URLSearchParams } from 'url'; // Import Node.js URL modules

// --- GET /api/grinders ---
export async function handleGetGrinders(req: any, res: any) {
    console.log('[grinderHandler] GET handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const grinders = await db.select()
                           .from(schema.grindersTable)
                           .where(eq(schema.grindersTable.userId, authResult.userId));
    return grinders; // Let router handle response
}

// --- POST /api/grinders ---
export async function handleAddGrinder(req: any, res: any) {
    console.log('[grinderHandler] POST handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const { name, type, notes } = await getBodyJSON(req);
    if (!name || typeof name !== 'string') throw { status: 400, message: 'Grinder name is required.' };
    
    const newGrinderData = {
        userId: authResult.userId,
        name,
        type: type || null,
        notes: notes || null,
    };
    
    const result = await db.insert(schema.grindersTable)
                           .values(newGrinderData)
                           .returning(); // Return the newly created grinder
                           
    if (result.length === 0) throw { status: 500, message: 'Failed to create grinder' };
    return result[0]; // Return the first (and only) inserted grinder
}

// --- PUT /api/grinders?id={id} ---
export async function handleUpdateGrinder(req: any, res: any) {
    console.log('[grinderHandler] PUT handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    // Use URLSearchParams to get query param
    const host = req.headers['host'] || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = `${protocol}://${host}${req.url || '/'}`;
    const url = new URL(fullUrl);
    const grinderId = url.searchParams.get('id');

    if (!grinderId) throw { status: 400, message: 'Grinder ID is required in query parameters.' };

    const { name, type, notes } = await getBodyJSON(req);
    if (!name || typeof name !== 'string') throw { status: 400, message: 'Grinder name is required.' };
    
    const updateData = {
        name,
        type: type !== undefined ? type : null, // Handle optional fields
        notes: notes !== undefined ? notes : null,
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
export async function handleDeleteGrinder(req: any, res: any) {
    console.log('[grinderHandler] DELETE handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    // Use URLSearchParams to get query param
    const host = req.headers['host'] || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = `${protocol}://${host}${req.url || '/'}`;
    const url = new URL(fullUrl);
    const grinderId = url.searchParams.get('id');

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