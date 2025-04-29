import * as schema from '../schema'; // Adjust path
import crypto from 'crypto'; // Keep for JWT helpers
import { eq } from 'drizzle-orm';

// Import shared DB
import { db } from '../../lib/db'; // Adjust path relative to api/auth/
// Import shared Auth helpers
import { JWT_SECRET, verifyPassword, createJwt } from '../../lib/auth'; // Adjust path
// Import shared Utils
import { getBodyJSON } from '../../lib/utils'; // Adjust path

// --- Vercel Request Handler for POST /api/auth/login ---
export default async (req: any, res: any) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    console.log('[login.ts] POST handler invoked');
    if (!db) {
         console.error('[login.ts:Error] DB client not available from lib.');
         return res.status(500).json({ message: 'DB not initialized' });
    }
    if (!JWT_SECRET) {
        console.error('[login.ts:Error] JWT_SECRET not available from lib.');
        return res.status(500).json({ message: 'JWT Secret not configured' });
    }

    try {
        const { email, password } = await getBodyJSON(req);

        // Validation
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ message: 'Email is required.' });
        }
        if (!password || typeof password !== 'string') {
            return res.status(400).json({ message: 'Password is required.' });
        }

        // Find user (using imported db)
        const foundUsers = await db.select()
                                .from(schema.usersTable)
                                .where(eq(schema.usersTable.email, email.toLowerCase()))
                                .limit(1);
        if (foundUsers.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        const user = foundUsers[0];

        // Verify password (using imported helper)
        const passwordMatches = await verifyPassword(password, user.passwordHash);
        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // Create JWT (using imported helper)
        const tokenPayload = {
            userId: user.id,
            email: user.email,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
        };
        const token = createJwt(tokenPayload, JWT_SECRET);

        return res.status(200).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        });

    } catch (error) {
        console.error('[login.ts:Error]', error);
        if (error instanceof Error && error.message.includes('Invalid JSON')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Internal Server Error during login' });
    }
}; 