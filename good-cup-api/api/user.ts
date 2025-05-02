import * as schema from './schema'; // Path relative to api/
import { eq } from 'drizzle-orm';

// Import shared DB
import { db } from '../lib/db'; // Path relative to api/
// Import shared Auth helpers
import { verifyAuthToken } from '../lib/auth'; // Correct function name
// Import shared Utils if needed (e.g., for error handling)
// import { handleError } from '../lib/utils';

// --- Vercel Request Handler for DELETE /api/user ---
export default async (req: any, res: any) => {
    // Handle CORS - Crucial for frontend interaction
    res.setHeader('Access-Control-Allow-Origin', '*'); // Be more specific in production!
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Ensure Authorization is allowed

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'DELETE') {
        res.setHeader('Allow', ['DELETE']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed on /api/user` });
    }

    console.log('[user.ts] DELETE handler invoked');
    if (!db) {
        console.error('[user.ts:Error] DB client not available from lib.');
        return res.status(500).json({ message: 'DB not initialized' });
    }

    try {
        // --- Authentication ---
        const authResult = await verifyAuthToken(req);
        if (!authResult.userId || authResult.error) {
            console.warn(`[user.ts] Auth failed: ${authResult.error}`);
            return res.status(authResult.status || 401).json({ message: authResult.error || 'Authentication failed.' });
        }
        const userId = authResult.userId; // Extracted userId
        console.log(`[user.ts] Attempting to delete user ID: ${userId}`);

        // --- Database Deletion ---
        // WARNING: This assumes related data (beans, devices, etc.) is handled
        // either by DB cascade rules (ON DELETE CASCADE) or doesn't need deletion.
        // If manual deletion of related data is needed, do it BEFORE this step.

        const deleteResult = await db.delete(schema.usersTable)
                                    .where(eq(schema.usersTable.id, userId));

        // Check if a user was actually deleted
        if (deleteResult.rowCount === 0) {
             console.warn(`[user.ts] No user found with ID ${userId} to delete.`);
             // Potentially return 404, but for a DELETE, success might be okay even if already gone
             // return res.status(404).json({ message: 'User not found.' });
        } else {
             console.log(`[user.ts] Successfully deleted user ID: ${userId}`);
        }
        
        // --- Success Response ---
        // Return 200 OK or 204 No Content on successful deletion
        return res.status(200).json({ message: 'Account deleted successfully' });

    } catch (error: any) {
        // Catch errors not already handled by verifyAuthToken (e.g., DB errors)
        console.error('[user.ts:Error] Catch block:', error);
        return res.status(500).json({ message: error.message || 'Internal Server Error during account deletion' });
    }
}; 