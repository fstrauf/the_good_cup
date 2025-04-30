// api/beans.ts - Handles ALL CRUD operations for /api/beans

import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../lib/db'; // Correct path relative to /api
import { beansTable } from './schema'; // Correct path relative to /api
import { eq, and } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Correct path relative to /api

export default async (req: VercelRequest, res: VercelResponse) => {
    // --- CORS Handling ---
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins
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
        // This should technically be unreachable if the checks above are correct
        return res.status(401).json({ message: 'Could not verify user identity' });
    }
    
    // --- DB Check ---
    if (!db) {
        console.error('[beans.ts] DB client not initialized.');
        return res.status(500).json({ message: 'Database client failed to initialize' });
    }

    // --- Route Logic based on Method and Query ID ---
    const { id: beanId } = req.query; // Get ID from query params

    try {
        // --- Operations WITHOUT ID (/api/beans) ---
        if (!beanId) {
            if (req.method === 'GET') {
                // --- GET /api/beans (List Beans) ---
                console.log(`[beans.ts] GET all invoked for user ${userId}`);
                const userBeans = await db.select()
                    .from(beansTable)
                    .where(eq(beansTable.userId, userId))
                    .orderBy(beansTable.createdAt);
                return res.status(200).json(userBeans);

            } else if (req.method === 'POST') {
                // --- POST /api/beans (Add Bean) ---
                console.log(`[beans.ts] POST invoked for user ${userId}`);
                const { name, roastedDate, ...otherBeanData }: { name?: string; roastedDate?: string | null; [key: string]: any } = req.body || {};
                
                if (!name) {
                    return res.status(400).json({ message: 'Bean name is required' });
                }

                // Convert roastedDate string to Date object if present and valid
                let roastedDateObj: Date | null = null;
                if (roastedDate && typeof roastedDate === 'string') {
                    const parsedDate = new Date(roastedDate);
                    // Check if the parsed date is valid
                    if (!isNaN(parsedDate.getTime())) {
                        roastedDateObj = parsedDate;
                    } else {
                        console.warn(`[beans.ts] Received invalid roastedDate string: ${roastedDate}`);
                        // Optionally return an error or proceed with null
                        // return res.status(400).json({ message: 'Invalid roastedDate format' });
                    }
                }

                const dataToInsert = { 
                    ...otherBeanData, 
                    name, 
                    userId, 
                    roastedDate: roastedDateObj // Use the Date object or null
                };

                const newBean = await db.insert(beansTable).values(dataToInsert).returning();
                if (!newBean || newBean.length === 0) {
                    throw new Error("Failed to insert bean.");
                }
                return res.status(201).json(newBean[0]);
            } else {
                // Method Not Allowed for base path
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/beans` });
            }
        }
        // --- Operations WITH ID (/api/beans?id=...) ---
        else {
            if (typeof beanId !== 'string') {
                 return res.status(400).json({ message: 'Invalid bean ID format in query' });
            }

            if (req.method === 'GET') {
                // --- GET /api/beans?id={beanId} (Get Single Bean) ---
                 console.log(`[beans.ts] GET invoked for ID: ${beanId}, user ${userId}`);
                 const result = await db.select()
                    .from(beansTable)
                    .where(and(eq(beansTable.id, beanId), eq(beansTable.userId, userId)))
                    .limit(1);
                 if (!result || result.length === 0) {
                    return res.status(404).json({ message: 'Bean not found' });
                 }
                 return res.status(200).json(result[0]);

            } else if (req.method === 'PUT') {
                // --- PUT /api/beans?id={beanId} (Update Bean) ---
                 console.log(`[beans.ts] PUT invoked for ID: ${beanId}, user ${userId}`);
                 const { roastedDate, ...otherBeanData }: { roastedDate?: string | null; [key: string]: any } = req.body || {};
                 
                 if (otherBeanData.name === '') {
                    return res.status(400).json({ message: 'Bean name cannot be empty' });
                 }
                 
                 // Convert roastedDate string to Date object if present and valid
                let roastedDateObj: Date | null = null;
                if (roastedDate !== undefined) { // Check if the key exists, even if null
                    if (roastedDate === null) {
                        roastedDateObj = null;
                    } else if (typeof roastedDate === 'string') {
                        const parsedDate = new Date(roastedDate);
                        if (!isNaN(parsedDate.getTime())) {
                            roastedDateObj = parsedDate;
                        } else {
                            console.warn(`[beans.ts] Received invalid roastedDate string for update: ${roastedDate}`);
                            // Optionally return an error or proceed with null/previous value
                            // return res.status(400).json({ message: 'Invalid roastedDate format for update' });
                        }
                    } else {
                         // Handle cases where roastedDate is present but not string/null (e.g., number)
                         console.warn(`[beans.ts] Received invalid type for roastedDate string for update: ${typeof roastedDate}`);
                         // return res.status(400).json({ message: 'Invalid roastedDate type for update' });
                    }
                }
                // If roastedDate was NOT included in req.body, we don't touch it in the DB
                // If it WAS included (even as null), we update it with roastedDateObj (which could be Date or null)

                 // Remove fields that shouldn't be updated directly
                 delete otherBeanData.id;
                 delete otherBeanData.userId;
                 delete otherBeanData.createdAt;
                 
                 const dataToSet: { [key: string]: any } = {
                    ...otherBeanData,
                    updatedAt: new Date(),
                 };

                 // Only include roastedDate in the update if it was present in the request body
                 if (roastedDate !== undefined) {
                     dataToSet.roastedDate = roastedDateObj;
                 }

                 console.log("[beans.ts] Data being sent to db.update:", dataToSet);

                 const updatedBean = await db.update(beansTable)
                    .set(dataToSet) // Use the object with potentially updated roastedDate
                    .where(and(eq(beansTable.id, beanId), eq(beansTable.userId, userId)))
                    .returning();
                 if (!updatedBean || updatedBean.length === 0) {
                    return res.status(404).json({ message: 'Bean not found or update failed' });
                 }
                 return res.status(200).json(updatedBean[0]);

            } else if (req.method === 'DELETE') {
                // --- DELETE /api/beans?id={beanId} (Delete Bean) ---
                console.log(`[beans.ts] DELETE invoked for ID: ${beanId}, user ${userId}`);
                const deletedBean = await db.delete(beansTable)
                    .where(and(eq(beansTable.id, beanId), eq(beansTable.userId, userId)))
                    .returning();
                if (!deletedBean || deletedBean.length === 0) {
                    return res.status(404).json({ message: 'Bean not found' });
                }
                return res.status(200).json({ message: 'Bean deleted successfully' });

            } else {
                 // Method Not Allowed for ID path
                res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
                return res.status(405).json({ message: `Method ${req.method} Not Allowed for /api/beans?id=${beanId}` });
            }
        }
    } catch (error: any) {
        console.error(`[beans.ts] Error (${req.method} ${req.url}):`, error);
        // Avoid sending detailed errors in production for security
        const errorMessage = process.env.NODE_ENV === 'production' 
            ? 'Internal Server Error' 
            : error instanceof Error ? error.message : String(error);
        return res.status(500).json({ 
            message: 'Internal Server Error', 
            details: errorMessage // Send details only in non-production
        });
    }
}; 