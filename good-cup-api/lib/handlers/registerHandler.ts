import * as schema from '../schema'; // Correct path relative to lib/
import { db } from '../db';
import { eq } from 'drizzle-orm';
// Import shared Auth helpers
import { JWT_SECRET, hashPassword, createJwt } from '../auth';
// Import shared Utils
import { getBodyJSON } from '../utils';
import type { Context } from 'hono';

// --- POST /api/auth/register Handler Logic ---
export async function handleRegister(c: Context) {
    console.log('[registerHandler] POST handler invoked');
    if (!db) {
        console.error('[registerHandler:Error] DB client not available');
        throw { status: 500, message: 'DB not initialized' };
    }
    if (!JWT_SECRET) {
        console.error('[registerHandler:Error] JWT_SECRET not available');
        throw { status: 500, message: 'JWT Secret not configured' };
    }

    // Get body using Hono context
    const body = await c.req.json();
    const { email, password, name } = body;

    // --- Basic Validation ---
    if (!email || typeof email !== 'string' || !email.includes('@')) {
         throw { status: 400, message: 'Valid email is required.' };
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
         throw { status: 400, message: 'Password must be at least 6 characters long.' };
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
         throw { status: 400, message: 'Name is required.' };
    }

    // --- Check if user already exists ---
    const existingUsers = await db.select({ id: schema.usersTable.id })
                                .from(schema.usersTable)
                                .where(eq(schema.usersTable.email, email.toLowerCase()))
                                .limit(1);
    if (existingUsers.length > 0) {
         throw { status: 409, message: 'Email already in use.' };
    }

    // --- Hash Password --- 
    const passwordHash = await hashPassword(password);

    // --- Create User --- 
    const newUser = {
        email: email.toLowerCase(),
        name: name.trim(),
        passwordHash,
    };
    const createdResult = await db.insert(schema.usersTable)
                                  .values(newUser)
                                  .returning({ 
                                      id: schema.usersTable.id,
                                      email: schema.usersTable.email,
                                      name: schema.usersTable.name,
                                  });

    if (createdResult.length === 0) {
        throw { status: 500, message: 'Failed to create user account.' };
    }
    const user = createdResult[0];

    // --- Create JWT --- 
    const tokenPayload = {
        userId: user.id,
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    };
    const token = createJwt(tokenPayload, JWT_SECRET);

    // --- Success Response --- 
    return {
        token,
        user, 
    };
} 