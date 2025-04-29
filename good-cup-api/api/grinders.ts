// api/grinders.ts - Handles GET, POST, PUT, DELETE
import * as schema from './schema'; 
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db'; 
import { verifyAuthToken } from '../lib/auth'; 
import { getBodyJSON } from '../lib/utils'; 

export default async (req: any, res: any) => {
    // Set CORS headers globally for all responses
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    
    // Handle OPTIONS preflight request
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Add PUT, DELETE
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    // Verify Authentication Token
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    const userId = authResult.userId;

    // Check DB connection
    if (!db) return res.status(500).json({ message: 'DB not initialized' });

    // Get ID from query, if present
    const { id } = req.query;

    // --- Routes WITHOUT ID (/api/grinders) ---
    if (!id) {
        // --- GET /api/grinders ---
        if (req.method === 'GET') {
            console.log('[grinders.ts] GET all invoked');
            try {
                const grinders = await db.select()
                  .from(schema.grindersTable)
                  .where(eq(schema.grindersTable.userId, userId))
                  .orderBy(schema.grindersTable.createdAt);
                return res.status(200).json(grinders);
            } catch (error) {
                console.error('[grinders.ts:GET:Error]', error);
                return res.status(500).json({ message: 'Internal Server Error fetching grinders' });
            }
        }
        // --- POST /api/grinders ---
        else if (req.method === 'POST') {
            console.log('[grinders.ts] POST invoked');
            try {
                const { name, type, notes } = await getBodyJSON(req);
                if (!name || typeof name !== 'string') {
                    return res.status(400).json({ message: 'Grinder name is required' });
                }
                const newGrinder = await db.insert(schema.grindersTable)
                    .values({ userId: userId, name: name, type: type || null, notes: notes || null })
                    .returning();
                if (newGrinder.length === 0) throw new Error('Failed to create grinder');
                return res.status(201).json(newGrinder[0]);
            } catch (error) {
                console.error('[grinders.ts:POST:Error]', error);
                if (error instanceof Error && error.message.includes('Invalid JSON')) {
                    return res.status(400).json({ message: error.message });
                }
                return res.status(500).json({ message: 'Internal Server Error creating grinder' });
            }
        }
        // --- Method Not Allowed ---
        else {
            res.setHeader('Allow', ['GET', 'POST']);
            return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/grinders` });
        }
    } 
    // --- Routes WITH ID (/api/grinders/[id]) ---
    else {
        const grinderId = id as string; // Already checked it's a string in the original [id].ts, keep check if needed
        if (typeof grinderId !== 'string') { // Add explicit check here just in case
            return res.status(400).json({ message: 'Invalid Grinder ID format' });
        }

        // --- PUT /api/grinders/[id] ---
        if (req.method === 'PUT') {
            console.log(`[grinders.ts] PUT invoked for ID: ${grinderId}`);
            try {
                const { name, type, notes } = await getBodyJSON(req);

                if (!name && !type && notes === undefined) {
                    return res.status(400).json({ message: 'No update fields provided' });
                }

                const updateValues: Partial<typeof schema.grindersTable.$inferInsert> = {};
                if (name !== undefined) updateValues.name = name;
                if (type !== undefined) updateValues.type = type;
                if (notes !== undefined) updateValues.notes = notes;

                const result = await db.update(schema.grindersTable)
                    .set(updateValues)
                    .where(and(eq(schema.grindersTable.id, grinderId), eq(schema.grindersTable.userId, userId)))
                    .returning();

                if (result.length === 0) {
                    return res.status(404).json({ message: 'Grinder not found or not authorized to update' });
                }

                return res.status(200).json(result[0]);
            } catch (error) {
                console.error(`[grinders.ts:PUT:Error] ID: ${grinderId}`, error);
                if (error instanceof Error && error.message.includes('Invalid JSON')) {
                    return res.status(400).json({ message: error.message });
                }
                return res.status(500).json({ message: 'Internal Server Error updating grinder' });
            }
        }
        // --- DELETE /api/grinders/[id] ---
        else if (req.method === 'DELETE') {
            console.log(`[grinders.ts] DELETE invoked for ID: ${grinderId}`);
            try {
                const result = await db.delete(schema.grindersTable)
                    .where(and(eq(schema.grindersTable.id, grinderId), eq(schema.grindersTable.userId, userId)))
                    .returning();

                if (result.length === 0) {
                    return res.status(404).json({ message: 'Grinder not found or not authorized to delete' });
                }

                return res.status(200).json({ message: 'Grinder deleted successfully', id: grinderId });
            } catch (error) {
                console.error(`[grinders.ts:DELETE:Error] ID: ${grinderId}`, error);
                return res.status(500).json({ message: 'Internal Server Error deleting grinder' });
            }
        }
        // --- Method Not Allowed ---
        else {
            res.setHeader('Allow', ['PUT', 'DELETE']);
            return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/grinders/${grinderId}` });
        }
    }
}; 