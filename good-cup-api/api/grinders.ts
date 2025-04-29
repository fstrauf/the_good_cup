// api/grinders.ts - Handles GET, POST, PUT, DELETE
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { db } from '../lib/db'; // Adjust path as needed
import { grindersTable } from './schema'; // Adjust path as needed
import { eq, and } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Adjust path as needed

// Define types for Hono context variables
type HonoEnv = {
  Variables: {
    userId: string;
  }
}

// Optional: Set to 'edge' if preferred
// export const runtime = 'edge';

const app = new Hono<HonoEnv>().basePath('/api/grinders');

// --- Authentication Middleware (Copied from beans/brew-devices) ---
app.use('*' /* Apply to all routes */, async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!JWT_SECRET) {
    console.error("[Auth Middleware] JWT_SECRET missing");
    return c.json({ message: 'Server configuration error' }, 500);
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ message: 'Authorization header missing or invalid' }, 401);
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyJwt(token, JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return c.json({ message: 'Invalid token payload' }, 401);
    }
    c.set('userId', decoded.userId);
    await next();
  } catch (error) {
    console.error("[Auth Middleware] Token verification failed:", error);
    const isExpired = error instanceof Error && error.message === 'JwtTokenExpired';
    return c.json({ message: isExpired ? 'Token expired' : 'Invalid token' }, 401);
  }
});

// --- Route Handlers ---

// GET /api/grinders (List Grinders)
app.get('/', async (c) => {
  const userId = c.get('userId');
  try {
    const grinders = await db.select().from(grindersTable).where(eq(grindersTable.userId, userId)).orderBy(grindersTable.name);
    return c.json(grinders);
  } catch (error) {
    console.error("Error fetching grinders:", error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// POST /api/grinders (Add Grinder)
app.post('/', async (c) => {
  const userId = c.get('userId');
  try {
    const { name, type, notes }: { name?: string; type?: string | null; notes?: string | null } = await c.req.json();
    if (!name) {
      return c.json({ message: 'Grinder name is required' }, 400);
    }
    const dataToInsert = { name, type, notes, userId };
    const newGrinder = await db.insert(grindersTable).values(dataToInsert).returning();
    if (!newGrinder || newGrinder.length === 0) {
      throw new Error("Failed to insert grinder.");
    }
    return c.json(newGrinder[0], 201);
  } catch (error) {
    console.error("Error adding grinder:", error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// GET /api/grinders/:id (Get Single Grinder)
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const grinderId = c.req.param('id');
  try {
    const result = await db.select().from(grindersTable).where(and(eq(grindersTable.id, grinderId), eq(grindersTable.userId, userId))).limit(1);
    if (!result || result.length === 0) {
      return c.json({ message: 'Grinder not found' }, 404);
    }
    return c.json(result[0]);
  } catch (error) {
    console.error(`Error fetching grinder ${grinderId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// PUT /api/grinders/:id (Update Grinder)
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const grinderId = c.req.param('id');
  try {
    const { name, type, notes }: { name?: string; type?: string | null; notes?: string | null } = await c.req.json();
    if (name === '') {
      return c.json({ message: 'Grinder name cannot be empty' }, 400);
    }
    const dataToUpdate = { name, type, notes, updatedAt: new Date() };
    const updatedGrinder = await db.update(grindersTable).set(dataToUpdate).where(and(eq(grindersTable.id, grinderId), eq(grindersTable.userId, userId))).returning();
    if (!updatedGrinder || updatedGrinder.length === 0) {
      return c.json({ message: 'Grinder not found or update failed' }, 404);
    }
    return c.json(updatedGrinder[0]);
  } catch (error) {
    console.error(`Error updating grinder ${grinderId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// DELETE /api/grinders/:id (Delete Grinder)
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const grinderId = c.req.param('id');
  try {
    const deletedGrinder = await db.delete(grindersTable).where(and(eq(grindersTable.id, grinderId), eq(grindersTable.userId, userId))).returning();
    if (!deletedGrinder || deletedGrinder.length === 0) {
      return c.json({ message: 'Grinder not found' }, 404);
    }
    return c.json({ message: 'Grinder deleted successfully' });
  } catch (error) {
    console.error(`Error deleting grinder ${grinderId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Export the Hono app handler
export default handle(app); 