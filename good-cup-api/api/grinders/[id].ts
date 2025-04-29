import * as schema from '../schema';
import { eq, and } from 'drizzle-orm';
import { db } from '../../lib/db';
import { verifyAuthToken } from '../../lib/auth';
import { getBodyJSON } from '../../lib/utils';

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

    if (!db) return res.status(500).json({ message: 'DB not initialized' });

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ message: 'Grinder ID is required in the path' });
    }

    // --- PUT /api/grinders/[id] ---
    if (req.method === 'PUT') {
        console.log(`[grinders/[id].ts] PUT invoked for ID: ${id}`);
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
                .where(and(eq(schema.grindersTable.id, id), eq(schema.grindersTable.userId, userId)))
                .returning();

            if (result.length === 0) {
                return res.status(404).json({ message: 'Grinder not found or not authorized to update' });
            }

            return res.status(200).json(result[0]);
        } catch (error) {
            console.error(`[grinders/[id].ts:PUT:Error] ID: ${id}`, error);
            if (error instanceof Error && error.message.includes('Invalid JSON')) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: 'Internal Server Error updating grinder' });
        }
    }

    // --- DELETE /api/grinders/[id] ---
    else if (req.method === 'DELETE') {
        console.log(`[grinders/[id].ts] DELETE invoked for ID: ${id}`);
        try {
            const result = await db.delete(schema.grindersTable)
                .where(and(eq(schema.grindersTable.id, id), eq(schema.grindersTable.userId, userId)))
                .returning();

            if (result.length === 0) {
                return res.status(404).json({ message: 'Grinder not found or not authorized to delete' });
            }

            return res.status(200).json({ message: 'Grinder deleted successfully', id: id });
        } catch (error) {
            console.error(`[grinders/[id].ts:DELETE:Error] ID: ${id}`, error);
            return res.status(500).json({ message: 'Internal Server Error deleting grinder' });
        }
    }

    // --- Method Not Allowed ---
    else {
        res.setHeader('Allow', ['PUT', 'DELETE']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
}; 