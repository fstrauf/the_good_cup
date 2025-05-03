import * as schema from '../schema'; // Correct path relative to lib/
import { db } from '../db';
import { eq, desc } from 'drizzle-orm';
import { verifyAuthToken } from '../auth';
import { getBodyJSON } from '../utils';
import { URL, URLSearchParams } from 'url';

// Helper to parse potential comma-separated string to array
const parseFlavorNotes = (notes: any): string[] | null => {
    if (typeof notes === 'string' && notes.trim() !== '') {
        return notes.split(',').map(note => note.trim());
    } else if (Array.isArray(notes)) {
        // Filter out any non-string elements just in case
        return notes.filter(note => typeof note === 'string');
    }
    return null;
};

// --- GET /api/beans ---
export async function handleGetBeans(req: any, res: any) {
    console.log('[beanHandler] GET handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    // Fetch beans ordered by creation date descending
    const beans = await db.select()
                        .from(schema.beansTable)
                        .where(eq(schema.beansTable.userId, authResult.userId))
                        .orderBy(desc(schema.beansTable.createdAt)); 
    return beans;
}

// --- GET /api/beans?id={id} ---
export async function handleGetBeanById(req: any, res: any) {
    console.log('[beanHandler] GET by ID handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const host = req.headers['host'] || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = `${protocol}://${host}${req.url || '/'}`;
    const url = new URL(fullUrl);
    const beanId = url.searchParams.get('id');

    if (!beanId) throw { status: 400, message: 'Bean ID is required in query parameters.' };

    const foundBeans = await db.select()
                               .from(schema.beansTable)
                               .where(eq(schema.beansTable.id, beanId) && eq(schema.beansTable.userId, authResult.userId))
                               .limit(1);

    if (foundBeans.length === 0) throw { status: 404, message: 'Bean not found or user unauthorized.' };
    return foundBeans[0];
}

// --- POST /api/beans ---
export async function handleAddBean(req: any, res: any) {
    console.log('[beanHandler] POST handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const body = await getBodyJSON(req);
    
    // Validation (ensure name exists)
    if (!body.name || typeof body.name !== 'string') throw { status: 400, message: 'Bean name is required.' };

    const newBeanData = {
        userId: authResult.userId,
        name: body.name,
        roaster: body.roaster || null,
        origin: body.origin || null,
        process: body.process || null,
        roastLevel: body.roastLevel || null,
        roastedDate: body.roastedDate || null, // Ensure date is handled correctly (ISO string?)
        flavorNotes: parseFlavorNotes(body.flavorNotes), // Use helper
        imageUrl: body.imageUrl || null,
        description: body.description || null,
    };

    const result = await db.insert(schema.beansTable)
                           .values(newBeanData)
                           .returning();
                           
    if (result.length === 0) throw { status: 500, message: 'Failed to add bean' };
    return result[0];
}

// --- PUT /api/beans?id={id} ---
export async function handleUpdateBean(req: any, res: any) {
    console.log('[beanHandler] PUT handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const host = req.headers['host'] || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = `${protocol}://${host}${req.url || '/'}`;
    const url = new URL(fullUrl);
    const beanId = url.searchParams.get('id');
    if (!beanId) throw { status: 400, message: 'Bean ID is required in query parameters.' };

    const body = await getBodyJSON(req);
    if (!body.name || typeof body.name !== 'string') throw { status: 400, message: 'Bean name is required.' };

    // Prepare update data - let TypeScript infer the type
    const updateData = {} as any; // Using `as any` temporarily to assign dynamic fields
    if (body.name !== undefined) updateData.name = body.name;
    if (body.roaster !== undefined) updateData.roaster = body.roaster;
    if (body.origin !== undefined) updateData.origin = body.origin;
    if (body.process !== undefined) updateData.process = body.process;
    if (body.roastLevel !== undefined) updateData.roastLevel = body.roastLevel;
    if (body.roastedDate !== undefined) updateData.roastedDate = body.roastedDate;
    if (body.flavorNotes !== undefined) updateData.flavorNotes = parseFlavorNotes(body.flavorNotes);
    if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
    if (body.description !== undefined) updateData.description = body.description;
    // Ensure only allowed fields are added

    if (Object.keys(updateData).length === 0) throw { status: 400, message: 'No update fields provided.' };

    const result = await db.update(schema.beansTable)
                           .set(updateData) // Drizzle should handle the partial update correctly
                           .where(eq(schema.beansTable.id, beanId) && eq(schema.beansTable.userId, authResult.userId))
                           .returning();

    if (result.length === 0) throw { status: 404, message: 'Bean not found or user unauthorized.' };
    return result[0];
}

// --- DELETE /api/beans?id={id} ---
export async function handleDeleteBean(req: any, res: any) {
    console.log('[beanHandler] DELETE handler invoked');
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const host = req.headers['host'] || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = `${protocol}://${host}${req.url || '/'}`;
    const url = new URL(fullUrl);
    const beanId = url.searchParams.get('id');
    if (!beanId) throw { status: 400, message: 'Bean ID is required in query parameters.' };

    const deleteResult = await db.delete(schema.beansTable)
                                 .where(eq(schema.beansTable.id, beanId) && eq(schema.beansTable.userId, authResult.userId));

    if (deleteResult.rowCount === 0) {
        console.warn(`[beanHandler] Bean ${beanId} not found for user ${authResult.userId} or already deleted.`);
    } else {
         console.log(`[beanHandler] Successfully deleted bean ${beanId} for user ${authResult.userId}`);
    }
    
    return { message: 'Bean deleted successfully' };
} 