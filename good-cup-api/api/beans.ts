// api/beans.ts - Handles GET /api/beans

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { db } from '../lib/db'; // Use path relative to api directory
import { beansTable } from './schema'; // Try path relative to project root
import { eq, and } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Use path relative to api directory

// Define types for Hono context variables
type HonoEnv = {
  Variables: {
    userId: string;
  }
}

// Optional: Set to 'edge' if preferred and dependencies support it
// export const runtime = 'edge';

// Initialize Hono with types
const app = new Hono<HonoEnv>().basePath('/api/beans');

// --- Middleware for Authentication ---
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
    c.set('userId', decoded.userId); // Store userId in context
    await next();
  } catch (error) {
    console.error("[Auth Middleware] Token verification failed:", error);
    const isExpired = error instanceof Error && error.message === 'JwtTokenExpired';
    return c.json({ message: isExpired ? 'Token expired' : 'Invalid token' }, 401);
  }
});

// --- Route Handlers ---

// GET /api/beans (List Beans)
app.get('/', async (c) => {
  const userId = c.get('userId');
  try {
    const userBeans = await db.select()
      .from(beansTable)
      .where(eq(beansTable.userId, userId))
      .orderBy(beansTable.createdAt);
    return c.json(userBeans);
  } catch (error) {
    console.error("Error fetching beans:", error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// POST /api/beans (Add Bean)
app.post('/', async (c) => {
  const userId = c.get('userId');
  try {
    const { name, ...beanData }: { name?: string; [key: string]: any } = await c.req.json();

    if (!name) {
      return c.json({ message: 'Bean name is required' }, 400);
    }

    const dataToInsert = { ...beanData, name, userId };
    const newBean = await db.insert(beansTable).values(dataToInsert).returning();

    if (!newBean || newBean.length === 0) {
      throw new Error("Failed to insert bean, database did not return the new record.");
    }
    return c.json(newBean[0], 201);
  } catch (error) {
    console.error("Error adding bean:", error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// GET /api/beans/:id (Get Single Bean)
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const beanId = c.req.param('id');
  try {
    const result = await db.select()
      .from(beansTable)
      .where(and(eq(beansTable.id, beanId), eq(beansTable.userId, userId)))
      .limit(1);

    if (!result || result.length === 0) {
      return c.json({ message: 'Bean not found' }, 404);
    }
    return c.json(result[0]);
  } catch (error) {
    console.error(`Error fetching bean ${beanId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// PUT /api/beans/:id (Update Bean)
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const beanId = c.req.param('id');
  try {
    const beanData: { [key: string]: any } = await c.req.json();

    // Basic validation (e.g., ensure name is not empty if provided)
    if (beanData.name === '') {
        return c.json({ message: 'Bean name cannot be empty' }, 400);
    }

    // Exclude potentially harmful fields or fields managed by the system
    delete beanData.id;
    delete beanData.userId;
    delete beanData.createdAt;
    beanData.updatedAt = new Date(); // Manually set update timestamp

    const updatedBean = await db.update(beansTable)
      .set(beanData)
      .where(and(eq(beansTable.id, beanId), eq(beansTable.userId, userId)))
      .returning();

    if (!updatedBean || updatedBean.length === 0) {
      return c.json({ message: 'Bean not found or update failed' }, 404);
    }
    return c.json(updatedBean[0]);
  } catch (error) {
    console.error(`Error updating bean ${beanId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// DELETE /api/beans/:id (Delete Bean)
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const beanId = c.req.param('id');
  try {
    const deletedBean = await db.delete(beansTable)
      .where(and(eq(beansTable.id, beanId), eq(beansTable.userId, userId)))
      .returning();

    if (!deletedBean || deletedBean.length === 0) {
      return c.json({ message: 'Bean not found' }, 404);
    }
    return c.json({ message: 'Bean deleted successfully' }); // 200 OK or 204 No Content
  } catch (error) {
    console.error(`Error deleting bean ${beanId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Export the Hono app handler for Vercel
export default handle(app); 