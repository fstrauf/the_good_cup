// api/grinders.ts - Handles ALL CRUD operations for /api/grinders

import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../lib/db'; // Adjust path as needed
import { grindersTable } from './schema'; // Adjust path as needed
import { eq, and } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Adjust path as needed

export default async (req: VercelRequest, res: VercelResponse) => {
    // --- CORS Handling ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // --- Authentication ---
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            if (!JWT_SECRET) {
                console.error("Auth error: JWT_SECRET missing");
                return res.status(500).json({ message: 'Server configuration error' });
            }
            const decoded = verifyJwt(token, JWT_SECRET);
            if (!decoded || !decoded.userId) {
                return res.status(401).json({ message: 'Invalid token payload' });
            }
            userId = decoded.userId as string;
        } catch (error) {
            console.error("Token verification failed:", error);
            const isExpired = error instanceof Error && error.message === 'JwtTokenExpired';
            return res.status(401).json({ message: isExpired ? 'Token expired' : 'Invalid or expired token' });
        }
    } else {
        return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }

    if (!userId) {
        return res.status(401).json({ message: 'Could not verify user identity' });
    }
    
    // --- DB Check ---
    if (!db) {
        console.error('[grinders.ts] DB client not initialized.');
        return res.status(500).json({ message: 'Database client failed to initialize' });
    }

    // --- Route Logic based on Method and Query ID ---
    const { id: grinderId } = req.query;

    try {
        // --- Operations WITHOUT ID (/api/grinders) ---
        if (!grinderId) {
            if (req.method === 'GET') {
                // --- GET /api/grinders (List Grinders) ---
                const grinders = await db.select().from(grindersTable).where(eq(grindersTable.userId, userId)).orderBy(grindersTable.name);
                return res.status(200).json(grinders);

            } else if (req.method === 'POST') {
                // --- POST /api/grinders (Add Grinder) ---
                const { name, type, notes }: { name?: string; type?: string | null; notes?: string | null } = req.body || {};
                if (!name) {
                    return res.status(400).json({ message: 'Grinder name is required' });
                }
                const dataToInsert = { name, type, notes, userId };
                const newGrinder = await db.insert(grindersTable).values(dataToInsert).returning();
                if (!newGrinder || newGrinder.length === 0) {
                    throw new Error("Failed to insert grinder.");
                }
                return res.status(201).json(newGrinder[0]);
            } else {
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/grinders` });
            }
        }
        // --- Operations WITH ID (/api/grinders?id=...) ---
        else {
            if (typeof grinderId !== 'string') {
                 return res.status(400).json({ message: 'Invalid grinder ID format in query' });
            }

            if (req.method === 'GET') {
                // --- GET /api/grinders?id={grinderId} ---
                 const result = await db.select().from(grindersTable).where(and(eq(grindersTable.id, grinderId), eq(grindersTable.userId, userId))).limit(1);
                 if (!result || result.length === 0) {
                    return res.status(404).json({ message: 'Grinder not found' });
                 }
                 return res.status(200).json(result[0]);

            } else if (req.method === 'PUT') {
                // --- PUT /api/grinders?id={grinderId} ---
                 const { name, type, notes }: { name?: string; type?: string | null; notes?: string | null } = req.body || {};
                 if (name === '') {
                    return res.status(400).json({ message: 'Grinder name cannot be empty' });
                 }
                 const dataToUpdate = { name, type, notes, updatedAt: new Date() };
                 const updatedGrinder = await db.update(grindersTable).set(dataToUpdate).where(and(eq(grindersTable.id, grinderId), eq(grindersTable.userId, userId))).returning();
                 if (!updatedGrinder || updatedGrinder.length === 0) {
                    return res.status(404).json({ message: 'Grinder not found or update failed' });
                 }
                 return res.status(200).json(updatedGrinder[0]);

            } else if (req.method === 'DELETE') {
                // --- DELETE /api/grinders?id={grinderId} ---
                const deletedGrinder = await db.delete(grindersTable).where(and(eq(grindersTable.id, grinderId), eq(grindersTable.userId, userId))).returning();
                if (!deletedGrinder || deletedGrinder.length === 0) {
                    return res.status(404).json({ message: 'Grinder not found' });
                }
                return res.status(200).json({ message: 'Grinder deleted successfully' });

            } else {
                res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
                return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/grinders?id=${grinderId}` });
            }
        }
    } catch (error: any) {
        console.error(`[grinders.ts] Error (${req.method} ${req.url}):`, error);
        const errorMessage = process.env.NODE_ENV === 'production' 
            ? 'Internal Server Error' 
            : error instanceof Error ? error.message : String(error);
        return res.status(500).json({ 
            message: 'Internal Server Error', 
            details: errorMessage
        });
    }
}; 