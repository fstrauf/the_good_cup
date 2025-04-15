import { Hono } from 'hono';
// import { handle } from 'hono/vercel'; // Keep commented for node server
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';

// Drizzle Imports
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
// Import pgSchema
import { pgTable, text, uuid, timestamp, pgSchema } from 'drizzle-orm/pg-core';

// Define the schema object
const goodCupSchema = pgSchema('good_cup');

// Define Drizzle users table within the specified schema
const usersTable = goodCupSchema.table('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Create the DB client directly in this file
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}
const sql = neon(connectionString);
const db = drizzle(sql, { schema: { users: usersTable }, logger: true });

// Restore constants
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Use standard Hono app
const app = new Hono().basePath('/api');

// --- Simple Test Route --- 
app.get('/hello', (c) => {
  console.log('--- /api/hello handler invoked --- ');
  return c.json({ message: 'Hello from Drizzle Hono API!' }); 
});

// --- Registration Route --- 
app.post('/auth/register', async (c) => {
  // Use db defined in this file's scope
  const { email, password, name } = await c.req.json();

  // --- Input Validation ---
  if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
    return c.json({ message: 'Invalid email format.' }, 400);
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return c.json({ message: 'Password must be at least 8 characters long.' }, 400);
  }
  if (name && typeof name !== 'string') {
    return c.json({ message: 'Invalid name format.' }, 400);
  }
  // --- End Input Validation ---

  try {
    // Use db defined in this file's scope
    const existingUsers = await db.select()
                               .from(usersTable)
                               .where(eq(usersTable.email, email.toLowerCase()))
                               .limit(1);

    if (existingUsers.length > 0) {
      return c.json({ message: 'User with this email already exists.' }, 409);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Use db defined in this file's scope
    const insertedUsers = await db.insert(usersTable)
                                  .values({
                                    email: email.toLowerCase(),
                                    passwordHash: passwordHash,
                                    name: name || null,
                                  })
                                  .returning({ 
                                    id: usersTable.id,
                                    email: usersTable.email,
                                    name: usersTable.name
                                  });

    if (insertedUsers.length === 0) {
      throw new Error('Failed to insert user.');
    }
    const newUser = insertedUsers[0];

    return c.json({ 
      message: 'User registered successfully.', 
      user: newUser
    }, 201);

  } catch (error) {
    console.error('Registration Error:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  } 
});

// --- Login Route --- 
app.post('/auth/login', async (c) => {
  // Use db defined in this file's scope
  if (!JWT_SECRET) {
    console.error('JWT_SECRET environment variable is not set.');
    return c.json({ message: 'Internal Server Error: Configuration missing' }, 500);
  }

  const { email, password } = await c.req.json();

  // --- Input Validation ---
  if (!email || typeof email !== 'string') {
    return c.json({ message: 'Email is required.' }, 400);
  }
  if (!password || typeof password !== 'string') {
    return c.json({ message: 'Password is required.' }, 400);
  }
  // --- End Input Validation ---

  try {
    // Use db defined in this file's scope
    const foundUsers = await db.select()
                             .from(usersTable)
                             .where(eq(usersTable.email, email.toLowerCase()))
                             .limit(1);

    if (foundUsers.length === 0) {
      return c.json({ message: 'Invalid email or password.' }, 401);
    }
    const user = foundUsers[0];

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return c.json({ message: 'Invalid email or password.' }, 401);
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
    };

    const token = await new Promise<string>((resolve, reject) => {
        jwt.sign(tokenPayload, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN }, (err, encoded) => {
            if (err) return reject(err);
            resolve(encoded as string);
        });
    });

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });

  } catch (error) {
    console.error('Login Error:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// Export the Hono app instance itself for node-server
export default app;

// Comment out the Vercel adapter export
// import { handle } from 'hono/vercel';
// export default handle(app); 