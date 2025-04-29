import * as schema from '../schema'; // Adjust path based on actual location
import crypto from 'crypto'; // Keep for hashPassword
import { eq } from 'drizzle-orm';

// Import shared DB
import { db } from '../../lib/db'; // Adjust path
// Import shared Auth helpers
import { hashPassword } from '../../lib/auth'; // Adjust path
// Import shared Utils
import { getBodyJSON, emailRegex } from '../../lib/utils'; // Adjust path

// --- Vercel Request Handler for POST /api/auth/register ---
export default async (req: any, res: any) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }

    // Only handle POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    console.log('[register.ts] POST handler invoked');
    if (!db) {
        console.error('[register.ts:Error] DB client not available from lib.');
        return res.status(500).json({ message: 'DB not initialized' });
    }

    try {
        const { email, password, name } = await getBodyJSON(req);
        
        // Validation
        if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
          return res.status(400).json({ message: 'Invalid email format.' });
        }
        if (!password || typeof password !== 'string' || password.length < 8) {
          return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
        }
        if (name && typeof name !== 'string') {
          return res.status(400).json({ message: 'Invalid name format.' });
        }

        // Check existing user (using imported db)
        const existingUsers = await db.select({ email: schema.usersTable.email })
                                    .from(schema.usersTable)
                                    .where(eq(schema.usersTable.email, email.toLowerCase()))
                                    .limit(1);
        if (existingUsers.length > 0) {
          return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // Hash password (using imported helper)
        const passwordHash = await hashPassword(password);

        // Insert user (using imported db)
        const insertedUsers = await db.insert(schema.usersTable)
                                    .values({
                                        email: email.toLowerCase(),
                                        passwordHash: passwordHash,
                                        name: name || null,
                                    })
                                    .returning({ 
                                        id: schema.usersTable.id,
                                        email: schema.usersTable.email,
                                        name: schema.usersTable.name
                                    });

        if (insertedUsers.length === 0) throw new Error('Failed to insert user.');
        const newUser = insertedUsers[0];

        return res.status(201).json({ 
            message: 'User registered successfully.', 
            user: newUser
        });

    } catch (error) {
        console.error('[register.ts:Error]', error);
        if (error instanceof Error && error.message.includes('Invalid JSON')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Internal Server Error during registration' });
    } 
}; 