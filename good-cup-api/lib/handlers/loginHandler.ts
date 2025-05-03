import * as schema from '../schema'; // Correct path relative to lib/
import crypto from 'crypto'; // Keep for JWT helpers
import { eq } from 'drizzle-orm';

// Import shared DB
import { db } from '../db'; // Correct path
// Import shared Auth helpers
import { JWT_SECRET, verifyPassword, createJwt } from '../auth'; // Correct path
// Import shared Utils
import { getBodyJSON } from '../utils'; // Correct path

// --- POST /api/auth/login Handler Logic ---
export async function handleLogin(req: any, res: any) {
    // Method/CORS checks should happen in the router (index.ts)

    console.log('[login.ts handler] POST handler invoked');
    if (!db) {
         console.error('[login.ts handler:Error] DB client not available');
         // Let router handle response
         throw { status: 500, message: 'DB not initialized' };
    }
    if (!JWT_SECRET) {
        console.error('[login.ts handler:Error] JWT_SECRET not available');
         throw { status: 500, message: 'JWT Secret not configured' };
    }

    try {
        const { email, password } = await getBodyJSON(req);

        // Validation
        if (!email || typeof email !== 'string') {
            throw { status: 400, message: 'Email is required.' };
        }
        if (!password || typeof password !== 'string') {
            throw { status: 400, message: 'Password is required.' };
        }

        // Find user
        const foundUsers = await db.select()
                                .from(schema.usersTable)
                                .where(eq(schema.usersTable.email, email.toLowerCase()))
                                .limit(1);
        if (foundUsers.length === 0) {
            throw { status: 401, message: 'Invalid email or password.' };
        }
        const user = foundUsers[0];

        // Verify password
        const passwordMatches = await verifyPassword(password, user.passwordHash);
        if (!passwordMatches) {
            throw { status: 401, message: 'Invalid email or password.' };
        }

        // Create JWT
        const tokenPayload = {
            userId: user.id,
            email: user.email,
            // Consider adding name/other non-sensitive info if useful in frontend
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
        };
        const token = createJwt(tokenPayload, JWT_SECRET);

        // Return success data for the router
        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        };

    } catch (error: any) {
        console.error('[login.ts handler:Error]', error);
        // Re-throw custom error object or a generic one
        if (error.status) { // If we already threw a custom error object
             throw error;
        }
        if (error instanceof Error && error.message.includes('Invalid JSON')) {
             throw { status: 400, message: error.message };
        }
        throw { status: 500, message: 'Internal Server Error during login' };
    }
}

// Remove the default export for Vercel file-based routing
// export default async (req: any, res: any) => { ... }; 