import * as schema from '../schema'; // Correct path relative to lib/
import { db } from '../db';
import { eq, desc } from 'drizzle-orm';
import { verifyAuthToken } from '../auth';
// No longer need getBodyJSON from utils if using c.req.json()
// import { getBodyJSON } from '../utils';
// No longer need URL/URLSearchParams if using c.req.query()
// import { URL, URLSearchParams } from 'url';
import type { Context } from 'hono'; // Import Hono context type

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

// --- GET /api/beans --- Accept Hono Context (c)
export async function handleGetBeans(c: Context) {
    console.log('[beanHandler] GET handler invoked');
    // Pass Hono request object (c.req) to verifyAuthToken
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    
    const beans = await db.select()
                        .from(schema.beansTable)
                        .where(eq(schema.beansTable.userId, authResult.userId))
                        .orderBy(desc(schema.beansTable.createdAt)); 
    // Handler now just returns data, router sends JSON response
    return beans;
}

// --- GET /api/beans?id={id} --- Accept Hono Context (c)
export async function handleGetBeanById(c: Context) {
    console.log('[beanHandler] GET by ID handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const beanId = c.req.query('id'); // Get query param from Hono context
    if (!beanId) throw { status: 400, message: 'Bean ID is required in query parameters.' };

    const foundBeans = await db.select()
                               .from(schema.beansTable)
                               .where(eq(schema.beansTable.id, beanId) && eq(schema.beansTable.userId, authResult.userId))
                               .limit(1);

    if (foundBeans.length === 0) throw { status: 404, message: 'Bean not found or user unauthorized.' };
    return foundBeans[0];
}

// --- POST /api/beans --- Accept Hono Context (c)
export async function handleAddBean(c: Context) {
    console.log('[beanHandler] POST handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const body = await c.req.json(); // Get JSON body from Hono context
    if (!body.name || typeof body.name !== 'string') throw { status: 400, message: 'Bean name is required.' };

    // Ensure roastedDate is a Date object if provided
    let roastedDateValue: Date | null = null;
    if (body.roastedDate && typeof body.roastedDate === 'string') {
        roastedDateValue = new Date(body.roastedDate);
        // Basic validation: Check if the date is valid after parsing
        if (isNaN(roastedDateValue.getTime())) {
            console.warn(`[beanHandler] Invalid roastedDate string received: ${body.roastedDate}`);
            roastedDateValue = null; // Or throw an error if date must be valid
            // throw { status: 400, message: 'Invalid roastedDate format.' }; 
        }
    } else if (body.roastedDate instanceof Date) {
        // If it's somehow already a Date object (less likely via JSON)
        roastedDateValue = body.roastedDate;
    }

    const newBeanData = {
        userId: authResult.userId,
        name: body.name,
        roaster: body.roaster || null,
        origin: body.origin || null,
        process: body.process || null,
        roastLevel: body.roastLevel || null,
        roastedDate: roastedDateValue, // Use the potentially converted Date object
        flavorNotes: parseFlavorNotes(body.flavorNotes),
        imageUrl: body.imageUrl || null,
        description: body.description || null,
    };

    const result = await db.insert(schema.beansTable)
                           .values(newBeanData)
                           .returning();
                           
    if (result.length === 0) throw { status: 500, message: 'Failed to add bean' };
    return result[0];
}

// --- PUT /api/beans?id={id} --- Accept Hono Context (c)
export async function handleUpdateBean(c: Context) {
    console.log('[beanHandler] PUT handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const beanId = c.req.query('id'); // Get query param
    if (!beanId) throw { status: 400, message: 'Bean ID is required in query parameters.' };

    const body = await c.req.json(); // Get JSON body
    if (!body.name || typeof body.name !== 'string') throw { status: 400, message: 'Bean name is required.' };

    const updateData = {} as any;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.roaster !== undefined) updateData.roaster = body.roaster;
    if (body.origin !== undefined) updateData.origin = body.origin;
    if (body.process !== undefined) updateData.process = body.process;
    if (body.roastLevel !== undefined) updateData.roastLevel = body.roastLevel;
    if (body.roastedDate !== undefined) updateData.roastedDate = body.roastedDate;
    if (body.flavorNotes !== undefined) updateData.flavorNotes = parseFlavorNotes(body.flavorNotes);
    if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
    if (body.description !== undefined) updateData.description = body.description;

    if (Object.keys(updateData).length === 0) throw { status: 400, message: 'No update fields provided.' };

    const result = await db.update(schema.beansTable)
                           .set(updateData)
                           .where(eq(schema.beansTable.id, beanId) && eq(schema.beansTable.userId, authResult.userId))
                           .returning();

    if (result.length === 0) throw { status: 404, message: 'Bean not found or user unauthorized.' };
    return result[0];
}

// --- DELETE /api/beans?id={id} --- Accept Hono Context (c)
export async function handleDeleteBean(c: Context) {
    console.log('[beanHandler] DELETE handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    const beanId = c.req.query('id'); // Get query param
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