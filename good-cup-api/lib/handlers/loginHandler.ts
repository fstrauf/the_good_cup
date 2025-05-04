import * as schema from '../schema'; // Correct path relative to lib/
import crypto from 'crypto'; // Keep for JWT helpers
import { eq } from 'drizzle-orm';
import { JWT_SECRET, verifyPassword, createJwt } from '../auth'; // Correct path
import type { Context } from 'hono';

// Import shared DB
import { db } from '../db'; // Correct path
// Import shared Auth helpers
import { getBodyJSON } from '../utils'; // Correct path

// --- POST /api/auth/login Handler Logic ---
export async function handleLogin(c: Context) {
    // Method/CORS checks should happen in the router (index.ts)

    console.log('[loginHandler] POST handler invoked');
    if (!db) {
         console.error('[loginHandler:Error] DB client not available');
         throw { status: 500, message: 'DB not initialized' };
    }
    if (!JWT_SECRET) {
        console.error('[loginHandler:Error] JWT_SECRET not available');
         throw { status: 500, message: 'JWT Secret not configured' };
    }

    // Get body using Hono context
    const body = await c.req.json();
    const { email, password } = body;

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
}

// Remove the default export for Vercel file-based routing
// export default async (req: any, res: any) => { ... }; 