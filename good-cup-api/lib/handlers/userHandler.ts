import * as schema from '../schema'; // Correct path relative to lib/
import { eq } from 'drizzle-orm';
import { db } from '../db'; // Path relative to handlers is ../db
// Import shared Auth helpers
import { verifyAuthToken } from '../auth'; // Path relative to handlers is ../auth
// Import shared Utils if needed (e.g., for error handling)
// import { handleError } from '../lib/utils';
import type { Context } from 'hono';

// --- DELETE /api/user Handler Logic ---
export async function handleDeleteUser(c: Context) {
    // Handle CORS - This might be better handled globally in index.ts
    // res.setHeader('Access-Control-Allow-Origin', '*'); 
    // res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    // res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); 
    // if (req.method === 'OPTIONS') { ... }

    // Method check should happen in the router (index.ts)
    // if (req.method !== 'DELETE') { ... }

    console.log('[userHandler] DELETE handler invoked');
    if (!db) {
        console.error('[userHandler:Error] DB client not available');
        throw { status: 500, message: 'DB not initialized' };
    }

    try {
        // Authentication
        const authResult = await verifyAuthToken(c.req);
        if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Authentication failed.' };
        const userId = authResult.userId; 
        console.log(`[userHandler] Attempting to delete user ID: ${userId}`);

        // Database Deletion (Add manual deletion of related data if needed!)
        const deleteResult = await db.delete(schema.usersTable)
                                    .where(eq(schema.usersTable.id, userId));

        if (deleteResult.rowCount === 0) {
             console.warn(`[userHandler] No user found with ID ${userId} to delete.`);
        } else {
             console.log(`[userHandler] Successfully deleted user ID: ${userId}`);
        }
        
        // Return success message
        return { success: true, message: 'Account deleted successfully' }; 

    } catch (error: any) {
        console.error('[userHandler:Error] Catch block:', error);
        // Re-throw or return error object for the router
        throw { status: error.status || 500, message: error.message || 'Internal Server Error during account deletion' };
    }
}

// Remove the default export for Vercel file-based routing
// export default async (req: any, res: any) => { ... }; 