// api/brew-devices.ts - Handles GET, POST, PUT, DELETE
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { db } from '../lib/db'; // Adjust path as needed
import { brewDevicesTable } from './schema'; // Adjust path as needed
import { eq, and } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Adjust path as needed

// Define types for Hono context variables (same as beans)
type HonoEnv = {
  Variables: {
    userId: string;
  }
}

// Optional: Set to 'edge' if preferred
// export const runtime = 'edge';

const app = new Hono<HonoEnv>().basePath('/api/brew-devices');

// --- Authentication Middleware (Copied from beans) ---
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

// GET /api/brew-devices (List Devices)
app.get('/', async (c) => {
  const userId = c.get('userId');
  try {
    const devices = await db.select().from(brewDevicesTable).where(eq(brewDevicesTable.userId, userId)).orderBy(brewDevicesTable.name);
    return c.json(devices);
  } catch (error) {
    console.error("Error fetching brew devices:", error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// POST /api/brew-devices (Add Device)
app.post('/', async (c) => {
  const userId = c.get('userId');
  try {
    const { name, type, notes }: { name?: string; type?: string | null; notes?: string | null } = await c.req.json();
    if (!name) {
      return c.json({ message: 'Device name is required' }, 400);
    }
    const dataToInsert = { name, type, notes, userId };
    const newDevice = await db.insert(brewDevicesTable).values(dataToInsert).returning();
    if (!newDevice || newDevice.length === 0) {
      throw new Error("Failed to insert device.");
    }
    return c.json(newDevice[0], 201);
  } catch (error) {
    console.error("Error adding brew device:", error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// GET /api/brew-devices/:id (Get Single Device)
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const deviceId = c.req.param('id');
  try {
    const result = await db.select().from(brewDevicesTable).where(and(eq(brewDevicesTable.id, deviceId), eq(brewDevicesTable.userId, userId))).limit(1);
    if (!result || result.length === 0) {
      return c.json({ message: 'Device not found' }, 404);
    }
    return c.json(result[0]);
  } catch (error) {
    console.error(`Error fetching device ${deviceId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// PUT /api/brew-devices/:id (Update Device)
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const deviceId = c.req.param('id');
  try {
    const { name, type, notes }: { name?: string; type?: string | null; notes?: string | null } = await c.req.json();
    if (name === '') {
      return c.json({ message: 'Device name cannot be empty' }, 400);
    }
    const dataToUpdate = { name, type, notes, updatedAt: new Date() }; // Ensure name is included if required
    const updatedDevice = await db.update(brewDevicesTable).set(dataToUpdate).where(and(eq(brewDevicesTable.id, deviceId), eq(brewDevicesTable.userId, userId))).returning();
    if (!updatedDevice || updatedDevice.length === 0) {
      return c.json({ message: 'Device not found or update failed' }, 404);
    }
    return c.json(updatedDevice[0]);
  } catch (error) {
    console.error(`Error updating device ${deviceId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// DELETE /api/brew-devices/:id (Delete Device)
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const deviceId = c.req.param('id');
  try {
    const deletedDevice = await db.delete(brewDevicesTable).where(and(eq(brewDevicesTable.id, deviceId), eq(brewDevicesTable.userId, userId))).returning();
    if (!deletedDevice || deletedDevice.length === 0) {
      return c.json({ message: 'Device not found' }, 404);
    }
    return c.json({ message: 'Device deleted successfully' });
  } catch (error) {
    console.error(`Error deleting device ${deviceId}:`, error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Export the Hono app handler
export default handle(app); 