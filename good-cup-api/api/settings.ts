// api/settings.ts

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { db } from '../lib/db'; // Adjust path as needed
import { userSettingsTable } from './schema'; // Adjust path as needed
import { eq } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Adjust path as needed

// Define types for Hono context variables
type HonoEnv = {
  Variables: {
    userId: string;
  }
}

// Optional: Set to 'edge' if preferred
// export const runtime = 'edge';

const app = new Hono<HonoEnv>().basePath('/api/settings');

// --- Authentication Middleware ---
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

// GET /api/settings (Get User Settings)
app.get('/', async (c) => {
  const userId = c.get('userId');
  try {
    const settings = await db.select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    
    // Return empty object if no settings found, as frontend might expect this
    return c.json(settings[0] || {}); 
  } catch (error) {
    console.error("Error fetching settings:", error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// PUT /api/settings (Update/Create User Settings - Upsert)
app.put('/', async (c) => {
  const userId = c.get('userId');
  try {
    const { defaultBrewDeviceId, defaultGrinderId }: { defaultBrewDeviceId?: string | null; defaultGrinderId?: string | null } = await c.req.json();

    // Validate input (basic check)
    if (defaultBrewDeviceId === undefined && defaultGrinderId === undefined) {
        return c.json({ message: 'No settings provided to update' }, 400);
    }

    const dataToUpsert = {
        userId: userId,
        defaultBrewDeviceId: defaultBrewDeviceId, // Will be null if not provided or explicitly null
        defaultGrinderId: defaultGrinderId,   // Will be null if not provided or explicitly null
        updatedAt: new Date(),
    };

    // Perform an upsert operation
    const updatedSettings = await db.insert(userSettingsTable)
      .values(dataToUpsert)
      .onConflictDoUpdate({ 
          target: userSettingsTable.userId, // Conflict on userId
          set: { // Fields to update on conflict
              defaultBrewDeviceId: dataToUpsert.defaultBrewDeviceId,
              defaultGrinderId: dataToUpsert.defaultGrinderId,
              updatedAt: dataToUpsert.updatedAt,
           } 
      })
      .returning(); // Return the updated/inserted record

    if (!updatedSettings || updatedSettings.length === 0) {
      throw new Error("Failed to upsert settings.");
    }

    return c.json(updatedSettings[0]);
  } catch (error) {
    console.error("Error updating settings:", error);
    return c.json({ message: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Export the Hono app handler
export default handle(app); 