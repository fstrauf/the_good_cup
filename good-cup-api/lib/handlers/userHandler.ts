import * as schema from '../schema'; // Correct path relative to lib/
import { eq } from 'drizzle-orm';

// Import shared DB
import { db } from '../db'; // Path relative to handlers is ../db
// Import shared Auth helpers
import { verifyAuthToken } from '../auth'; // Path relative to handlers is ../auth
// Import shared Utils if needed (e.g., for error handling)
// import { handleError } from '../lib/utils';

// --- DELETE /api/user Handler Logic ---
export async function handleDeleteUser(req: any, res: any) {
    // Handle CORS - This might be better handled globally in index.ts
    // res.setHeader('Access-Control-Allow-Origin', '*'); 
    // res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    // res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); 
    // if (req.method === 'OPTIONS') { ... }

    // Method check should happen in the router (index.ts)
    // if (req.method !== 'DELETE') { ... }

    console.log('[user.ts handler] DELETE handler invoked');
    if (!db) {
        console.error('[user.ts handler:Error] DB client not available from lib.');
        return res.status(500).json({ message: 'DB not initialized' });
    }

    try {
        // --- Authentication ---
        const authResult = await verifyAuthToken(req);
        if (!authResult.userId || authResult.error) {
            console.warn(`[user.ts handler] Auth failed: ${authResult.error}`);
            // Let the router handle sending the response
            // return res.status(authResult.status || 401).json({ message: authResult.error || 'Authentication failed.' });
            // Instead, throw an error or return a specific object for the router to handle
            throw { status: authResult.status || 401, message: authResult.error || 'Authentication failed.' };
        }
        const userId = authResult.userId; // Extracted userId
        console.log(`[user.ts handler] Attempting to delete user ID: ${userId}`);

        // --- Database Deletion ---
        const deleteResult = await db.delete(schema.usersTable)
                                    .where(eq(schema.usersTable.id, userId));

        if (deleteResult.rowCount === 0) {
             console.warn(`[user.ts handler] No user found with ID ${userId} to delete.`);
        } else {
             console.log(`[user.ts handler] Successfully deleted user ID: ${userId}`);
        }
        
        // --- Success Response (Let router send it) ---
        // return res.status(200).json({ message: 'Account deleted successfully' });
        return { success: true, message: 'Account deleted successfully' }; // Return data for the router

    } catch (error: any) {
        console.error('[user.ts handler:Error] Catch block:', error);
        // Re-throw or return error object for the router
        throw { status: error.status || 500, message: error.message || 'Internal Server Error during account deletion' };
    }
}

// Remove the default export for Vercel file-based routing
// export default async (req: any, res: any) => { ... }; 