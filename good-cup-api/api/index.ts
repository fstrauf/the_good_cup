import { Hono, Context } from 'hono';
import { handle } from 'hono/vercel'; // <-- RE-ENABLE this import
import { sign, verify } from 'hono/jwt';
import { eq, and, desc } from 'drizzle-orm';
import OpenAI from 'openai';

// Drizzle Imports
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
// Import tables from schema.ts
import * as schema from './schema';
// We also need the usersTable specifically for some queries, let's import it directly
import { usersTable } from './schema';

// --- Database Setup ---
const connectionString = process.env.DATABASE_URL;
console.log('DATABASE_URL retrieved:', connectionString ? 'Exists' : 'MISSING!');

if (!connectionString) {
  console.error('FATAL: DATABASE_URL environment variable is not set.');
  throw new Error('DATABASE_URL environment variable is not set.');
}

console.log('Initializing Neon client...');
const sql = neon(connectionString);
console.log('Neon client initialized.');

console.log('Initializing Drizzle client...');
// Use the imported schema object for the client
const db = drizzle(sql, { schema, logger: true });
console.log('Drizzle client initialized.');
// --- End Database Setup ---

// Restore constants
const JWT_SECRET = process.env.JWT_SECRET;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Web Crypto Helper Functions (keep as is) ---
// Function to convert ArrayBuffer to Base64 string (Edge compatible)
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Use Buffer for Node.js environment if available, otherwise fallback
  return typeof Buffer !== 'undefined' ? Buffer.from(binary, 'binary').toString('base64') : btoa(binary);
};

// Function to convert Base64 string to Uint8Array (Edge compatible)
const base64ToUint8Array = (base64: string): Uint8Array => {
    const binary_string = typeof Buffer !== 'undefined' ? Buffer.from(base64, 'base64').toString('binary') : atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
};

// Function to hash password using PBKDF2 with Web Crypto
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)); // Use crypto directly if available
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    32 * 8 // length in bits
  );

  const saltBase64 = arrayBufferToBase64(salt);
  const hashBase64 = arrayBufferToBase64(hashBuffer);
  return `${saltBase64}$${hashBase64}`; // Store salt and hash together
}

// Function to verify password against stored hash
async function verifyPassword(password: string, storedHashString: string): Promise<boolean> {
  const [saltBase64, storedHashBase64] = storedHashString.split('$');
  if (!saltBase64 || !storedHashBase64) {
    console.error('Invalid stored hash format');
    return false; // Or throw an error
  }

  const salt = base64ToUint8Array(saltBase64);
  const storedHash = base64ToUint8Array(storedHashBase64);

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedHashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    32 * 8 // length in bits
  );

  const derivedHash = new Uint8Array(derivedHashBuffer);

  // Constant-time comparison
  if (derivedHash.length !== storedHash.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < derivedHash.length; i++) {
    diff |= derivedHash[i] ^ storedHash[i];
  }
  return diff === 0;
}
// --- End Web Crypto Helper Functions ---

// --- Type definition for Hono context variables ---
type HonoEnv = {
  Variables: {
    userId: string;
  }
}

// --- Authentication Middleware ---
const authMiddleware = async (c: Context<HonoEnv>, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  if (!JWT_SECRET) {
    console.error('JWT_SECRET environment variable is not set for middleware.');
    return c.json({ message: 'Internal Server Error: Configuration missing' }, 500);
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ message: 'Unauthorized: Missing or invalid token format' }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const payload = await verify(token, JWT_SECRET);
    if (!payload || !payload.userId) {
      return c.json({ message: 'Unauthorized: Invalid token payload' }, 401);
    }
    c.set('userId', payload.userId as string);
    await next();
  } catch (error) {
    console.error('Token verification failed:', error);
    if (error instanceof Error && error.name === 'JwtTokenExpired') {
      return c.json({ message: 'Unauthorized: Token expired' }, 401);
    }
    return c.json({ message: 'Unauthorized: Invalid token' }, 401);
  }
};
// --- End Authentication Middleware ---

// Initialize Hono App
const app = new Hono<HonoEnv>();

// --- Root Route ---
app.get('/', async (c) => {
  console.log('--- Root GET handler invoked ---');
  // Simplest possible response using c.text
  return c.text('API root says hello! (Hono/async)');
});

// --- Helper Functions ---
const formatTime = (totalSeconds: number): string => {
    if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};
// ... other helpers (calculateAgeDays, extractJson) can remain ...
const calculateAgeDays = (roastedTimestamp?: number, brewTimestamp?: number): number | null => {
  if (!roastedTimestamp || !brewTimestamp) return null;
  const roastedDate = new Date(roastedTimestamp);
  const brewDate = new Date(brewTimestamp);

  roastedDate.setHours(0, 0, 0, 0);
  brewDate.setHours(0, 0, 0, 0);

  const differenceInTime = brewDate.getTime() - roastedDate.getTime();
  const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));

  return differenceInDays >= 0 ? differenceInDays : null;
};

const extractJson = (content: string | null): any | null => {
  if (!content) return null;
  content = content.trim(); // Trim whitespace first

  // Check for markdown code fence (json specifically)
  const codeFenceMatch = content.match(/```json\\s*([\\s\\S]*?)\\s*```/);
  if (codeFenceMatch && codeFenceMatch[1]) {
    content = codeFenceMatch[1].trim();
  } else {
    // Fallback: Check for generic code fence
    const genericCodeFenceMatch = content.match(/```\\s*([\\s\\S]*?)\\s*```/);
    if (genericCodeFenceMatch && genericCodeFenceMatch[1]) {
      content = genericCodeFenceMatch[1].trim();
    }
    // Fallback: Find first { and last }
    else if (content.startsWith('{') && content.endsWith('}')) {
      // Looks like raw JSON already, do nothing
    } else {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          content = content.substring(firstBrace, lastBrace + 1).trim();
        }
    }
  }

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse extracted JSON content:", content, e);
    return null; // Return null if parsing fails
  }
};

// --- Re-implement API Routes using Hono ---

// Placeholder for Login/Register (assuming handled elsewhere or add back if needed)
// app.post('/auth/login', ...)
// app.post('/auth/register', ...)

// Analyze Image
app.post('/analyze-image', authMiddleware, async (c) => {
    // ... (Existing analyze image logic using OpenAI) ...
     const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (!OPENAI_API_KEY) {
        return c.json({ error: 'Server configuration error: Missing OpenAI API key' }, 500);
      }
      // Auth already handled by middleware

      try {
        const { image } = await c.req.json();
        if (!image) {
          return c.json({ error: 'Missing required parameter: image' }, 400);
        }

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        // ... (rest of OpenAI call and response handling)
         const prompt = `Analyze this coffee bean package image and extract the following information:
        1. Bean Name: The name of the coffee beans
        2. Origin Country: The country where the beans are from
        3. Processing Method: The process used (washed, natural, honey, etc.)
        4. Roast Level: The roast level (light, medium, dark, etc.)
        5. Flavor Notes: The flavor notes mentioned on the package

        Return ONLY a JSON object with the following structure without any text outside the JSON:
        {
          "beanName": "Name of the coffee beans",
          "country": "Origin country",
          "process": "Processing method",
          "roastLevel": "Roast level",
          "flavorNotes": ["Note 1", "Note 2", "Note 3"]
        }

        If any information is not visible or cannot be determined from the image, use null for that field.`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 500,
        });

        const messageContent = response.choices[0]?.message?.content;
        if (!messageContent) {
          return c.json({ error: 'No message content received from OpenAI API' }, 500);
        }

        const jsonResponse = extractJson(messageContent);

        if (jsonResponse) {
          return c.json(jsonResponse);
        } else {
          console.error('Failed to extract/parse OpenAI response:', messageContent);
          return c.json({
              error: 'Failed to parse AI response as JSON',
              rawResponse: messageContent
            }, 500);
        }

      } catch (error: unknown) {
        console.error('Error processing /analyze-image:', error);
        return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500);
      }
});

// Brew Suggestions (History)
// Temporarily comment out route using undefined Brew type
/*
interface Brew { // Define Brew interface here or import if possible
  beanName: string;
  steepTime: number;
  grindSize: string;
  waterTemp: number;
  useBloom: boolean;
  bloomTime?: number;
  brewDevice?: string;
  grinder?: string;
  notes?: string;
  rating?: number;
  roastedDate?: number;
  timestamp: number;
}
app.post('/brew-suggestions', authMiddleware, async (c) => {
    // ... (Existing brew suggestions logic using OpenAI) ...
});
*/

// Brew Suggestion (Generic)
app.post('/brew-suggestion', authMiddleware, async (c) => {
    // ... (Existing generic brew suggestion logic using OpenAI) ...
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (!OPENAI_API_KEY) {
        return c.json({ error: 'Server configuration error: Missing OpenAI API key' }, 500);
      }

      try {
        const {
          beanName,
          country,
          process,
          roastLevel,
          flavorNotes,
          brewMethod,
          roastedDate,
          userComment // <<< Add userComment
        } = await c.req.json();

        if (!beanName || !brewMethod) {
          return c.json({ error: 'Missing required parameters: beanName and brewMethod are required' }, 400);
        }
         const beanAge = roastedDate ? calculateAgeDays(roastedDate, Date.now()) : null;
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        let prompt = `Please suggest optimal brewing parameters for the following coffee:

Bean Name: ${beanName}
Origin: ${country || 'Unknown'}
Process: ${process || 'Unknown'}
Roast Level: ${roastLevel || 'Unknown'}
Flavor Notes: ${flavorNotes ? flavorNotes.join(', ') : 'Unknown'}
Bean Age (days since roast): ${beanAge !== null ? beanAge : 'Unknown'}
Brew Method: ${brewMethod}

Provide brew parameters optimized for this specific coffee's characteristics and user comment (if any). 
Return ONLY a JSON object with the following structure without any text outside the JSON:
{
  "suggestionText": "A brief explanation of why these parameters would work well with this coffee (2-3 sentences)",
  "suggestedGrindSize": "Suggested grind size (e.g. Fine, Medium-Fine, Medium, Medium-Coarse, Coarse)",
  "suggestedWaterTemp": 93,
  "suggestedSteepTimeSeconds": 150,
  "suggestedUseBloom": true,
  "suggestedBloomTimeSeconds": 30
}

Note that suggestedWaterTemp is in Celsius, suggestedSteepTimeSeconds and suggestedBloomTimeSeconds are in seconds. suggestedUseBloom is a boolean.`;

         // ADD userComment to prompt if present
        if (userComment) {
          prompt += `\nUser Comment/Request: ${userComment}\n`;
        }

        prompt += `\nProvide brew parameters optimized for this specific coffee's characteristics and user comment (if any)...`; // Adjust rest of prompt

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
        });
        // ... (Handle response, use extractJson)
         const messageContent = response.choices[0]?.message?.content;
        if (!messageContent) {
          return c.json({ error: 'No message content received from OpenAI API' }, 500);
        }

        const jsonResponse = extractJson(messageContent);

         if (jsonResponse) {
           if (typeof jsonResponse.suggestedSteepTimeSeconds === 'number') {
             jsonResponse.steepTimeFormatted = formatTime(jsonResponse.suggestedSteepTimeSeconds);
           }
           if (typeof jsonResponse.suggestedBloomTimeSeconds === 'number') {
             jsonResponse.bloomTimeFormatted = formatTime(jsonResponse.suggestedBloomTimeSeconds);
           }
          return c.json(jsonResponse);
        } else {
          console.error('Failed to extract/parse OpenAI response:', messageContent);
          return c.json({
              error: 'Failed to parse AI response as JSON',
              rawResponse: messageContent
            }, 500);
        }

      } catch (error: unknown) {
        console.error('Error processing /brew-suggestion:', error);
        return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500);
      }
});

// --- Beans API Routes (using Hono) ---
app.get('/beans', authMiddleware, async (c) => {
  const userId = c.get('userId');
  try {
    const beans = await db.select()
      .from(schema.beansTable)
      .where(eq(schema.beansTable.userId, userId))
      .orderBy(schema.beansTable.createdAt);
    return c.json(beans);
  } catch (error) {
    console.error('Error fetching beans:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

app.post('/beans', authMiddleware, async (c) => {
  const userId = c.get('userId');
  try {
        const body = await c.req.json();
        // Validation
        if (!body.name || typeof body.name !== 'string') {
            return c.json({ message: 'Bean name is required' }, 400);
        }

        const newBean = await db.insert(schema.beansTable)
        .values({
            userId: userId,
            name: body.name,
            roaster: body.roaster || null,
            origin: body.origin || null,
            process: body.process || null,
            roastLevel: body.roastLevel || null,
            roastedDate: body.roastedDate ? new Date(body.roastedDate) : null,
            flavorNotes: body.flavorNotes || null,
            imageUrl: body.imageUrl || null,
        })
        .returning();

        if (newBean.length === 0) {
            throw new Error('Failed to create bean.');
        }
        return c.json(newBean[0], 201);
    } catch (error) {
        console.error('Error creating bean:', error);
        // Check for specific DB errors if needed
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

app.get('/beans/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const beanId = c.req.param('id');
    try {
        const bean = await db.select()
        .from(schema.beansTable)
        .where(and(eq(schema.beansTable.id, beanId), eq(schema.beansTable.userId, userId)))
        .limit(1);

        if (bean.length === 0) {
            return c.json({ message: 'Bean not found' }, 404);
        }
        return c.json(bean[0]);
    } catch (error) {
        console.error('Error fetching bean:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

app.put('/beans/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const beanId = c.req.param('id');
     try {
        const body = await c.req.json();
        // Validation
        if (!body.name || typeof body.name !== 'string') {
            return c.json({ message: 'Bean name is required' }, 400);
        }

        const updatedBean = await db.update(schema.beansTable)
        .set({
            name: body.name,
            roaster: body.roaster || null,
            origin: body.origin || null,
            process: body.process || null,
            roastLevel: body.roastLevel || null,
            roastedDate: body.roastedDate ? new Date(body.roastedDate) : null,
            flavorNotes: body.flavorNotes || null,
            imageUrl: body.imageUrl || null,
            updatedAt: new Date(),
        })
        .where(and(eq(schema.beansTable.id, beanId), eq(schema.beansTable.userId, userId)))
        .returning();

        if (updatedBean.length === 0) {
        return c.json({ message: 'Bean not found or update failed' }, 404);
        }
        return c.json(updatedBean[0]);
    } catch (error) {
        console.error('Error updating bean:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

app.delete('/beans/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const beanId = c.req.param('id');
    try {
        const deletedBean = await db.delete(schema.beansTable)
        .where(and(eq(schema.beansTable.id, beanId), eq(schema.beansTable.userId, userId)))
        .returning({ id: schema.beansTable.id });

        if (deletedBean.length === 0) {
        return c.json({ message: 'Bean not found or delete failed' }, 404);
        }
        return c.json({ message: 'Bean (and associated brews) deleted successfully' });
    } catch (error) {
        console.error('Error deleting bean:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

// --- Brews API Routes ---
app.get('/brews', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const beanId = c.req.query('beanId');
     try {
        const conditions = [eq(schema.brewsTable.userId, userId)];
        if (beanId) {
        conditions.push(eq(schema.brewsTable.beanId, beanId));
        }

        const brews = await db.select()
        .from(schema.brewsTable)
        .where(and(...conditions))
        .orderBy(desc(schema.brewsTable.timestamp));

        return c.json(brews);
    } catch (error) {
        console.error('Error fetching brews:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});
app.post('/brews', authMiddleware, async (c) => {
     const userId = c.get('userId');
     try {
        const body = await c.req.json();
        // Validation
        if (!body.beanId || typeof body.beanId !== 'string') {
            return c.json({ message: 'beanId is required' }, 400);
        }
        if (body.timestamp === undefined || typeof body.timestamp !== 'number') {
            return c.json({ message: 'timestamp (number) is required' }, 400);
        }

        const newBrew = await db.insert(schema.brewsTable)
        .values({
            userId: userId,
            beanId: body.beanId,
            brewDeviceId: body.brewDeviceId || null,
            grinderId: body.grinderId || null,
            timestamp: new Date(body.timestamp),
            steepTimeSeconds: body.steepTimeSeconds || null,
            grindSize: body.grindSize || null,
            waterTempCelsius: body.waterTempCelsius || null,
            useBloom: body.useBloom !== undefined ? body.useBloom : null,
            bloomTimeSeconds: body.bloomTimeSeconds || null,
            notes: body.notes || null,
            rating: body.rating || null,
        })
        .returning();

        if (newBrew.length === 0) {
            throw new Error('Failed to create brew log.');
        }
        return c.json(newBrew[0], 201);
    } catch (error) {
        console.error('Error creating brew log:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

app.get('/brews/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const brewId = c.req.param('id');
    try {
        const brew = await db.select()
        .from(schema.brewsTable)
        .where(and(eq(schema.brewsTable.id, brewId), eq(schema.brewsTable.userId, userId)))
        .limit(1);

        if (brew.length === 0) {
            return c.json({ message: 'Brew log not found' }, 404);
        }
        return c.json(brew[0]);
    } catch (error) {
        console.error('Error fetching brew log:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

app.put('/brews/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const brewId = c.req.param('id');
     try {
        const body = await c.req.json();
        // Validation
        if (body.timestamp === undefined || typeof body.timestamp !== 'number') {
            return c.json({ message: 'timestamp (number) is required' }, 400);
        }

        const updatedBrew = await db.update(schema.brewsTable)
        .set({
            brewDeviceId: body.brewDeviceId || null,
            grinderId: body.grinderId || null,
            timestamp: new Date(body.timestamp),
            steepTimeSeconds: body.steepTimeSeconds || null,
            grindSize: body.grindSize || null,
            waterTempCelsius: body.waterTempCelsius || null,
            useBloom: body.useBloom !== undefined ? body.useBloom : null,
            bloomTimeSeconds: body.bloomTimeSeconds || null,
            notes: body.notes || null,
            rating: body.rating || null,
            updatedAt: new Date(),
        })
        .where(and(eq(schema.brewsTable.id, brewId), eq(schema.brewsTable.userId, userId)))
        .returning();

        if (updatedBrew.length === 0) {
            return c.json({ message: 'Brew log not found or update failed' }, 404);
        }
        return c.json(updatedBrew[0]);
    } catch (error) {
        console.error('Error updating brew log:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

app.delete('/brews/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const brewId = c.req.param('id');
    try {
        const deletedBrew = await db.delete(schema.brewsTable)
        .where(and(eq(schema.brewsTable.id, brewId), eq(schema.brewsTable.userId, userId)))
        .returning({ id: schema.brewsTable.id });

        if (deletedBrew.length === 0) {
            return c.json({ message: 'Brew log not found or delete failed' }, 404);
        }
        return c.json({ message: 'Brew log deleted successfully' });
    } catch (error) {
        console.error('Error deleting brew log:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});


// --- Settings API Routes ---
app.get('/settings', authMiddleware, async (c) => {
    const userId = c.get('userId');
    try {
        const settings = await db.select({
            defaultBrewDeviceId: schema.userSettingsTable.defaultBrewDeviceId,
            defaultGrinderId: schema.userSettingsTable.defaultGrinderId
        })
        .from(schema.userSettingsTable)
        .where(eq(schema.userSettingsTable.userId, userId))
        .limit(1);

        if (settings.length > 0) {
            return c.json(settings[0]);
        } else {
            return c.json({ defaultBrewDeviceId: null, defaultGrinderId: null });
        }
    } catch (error) {
        console.error('Error fetching user settings:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

app.put('/settings', authMiddleware, async (c) => {
    const userId = c.get('userId');
     try {
        const { defaultBrewDeviceId, defaultGrinderId } = await c.req.json();
        // Validation
         if (defaultBrewDeviceId !== null && typeof defaultBrewDeviceId !== 'string') {
            return c.json({ message: 'Invalid format for defaultBrewDeviceId' }, 400);
        }
        if (defaultGrinderId !== null && typeof defaultGrinderId !== 'string') {
            return c.json({ message: 'Invalid format for defaultGrinderId' }, 400);
        }

        const upsertedSettings = await db.insert(schema.userSettingsTable)
        .values({
            userId: userId,
            defaultBrewDeviceId: defaultBrewDeviceId || null,
            defaultGrinderId: defaultGrinderId || null,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: schema.userSettingsTable.userId,
            set: {
                defaultBrewDeviceId: defaultBrewDeviceId || null,
                defaultGrinderId: defaultGrinderId || null,
                updatedAt: new Date(),
            }
        })
        .returning({
            userId: schema.userSettingsTable.userId,
            defaultBrewDeviceId: schema.userSettingsTable.defaultBrewDeviceId,
            defaultGrinderId: schema.userSettingsTable.defaultGrinderId
        });

        if (upsertedSettings.length === 0) {
            throw new Error('Failed to update/create user settings.');
        }
        return c.json(upsertedSettings[0]);
    } catch (error) {
        console.error('Error updating user settings:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

// --- Brew Devices API Routes ---
app.get('/brew-devices', authMiddleware, async (c) => {
    const userId = c.get('userId');
    try {
        const devices = await db.select()
        .from(schema.brewDevicesTable)
        .where(eq(schema.brewDevicesTable.userId, userId))
        .orderBy(schema.brewDevicesTable.createdAt);
        return c.json(devices);
    } catch (error) {
        console.error('Error fetching brew devices:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});
app.post('/brew-devices', authMiddleware, async (c) => {
    const userId = c.get('userId');
    try {
        const { name, type, notes } = await c.req.json();
        if (!name || typeof name !== 'string') {
            return c.json({ message: 'Device name is required' }, 400);
        }

        const newDevice = await db.insert(schema.brewDevicesTable)
        .values({
            userId: userId,
            name: name,
            type: type || null,
            notes: notes || null,
        })
        .returning();

        if (newDevice.length === 0) {
            throw new Error('Failed to create brew device.')
        }
        return c.json(newDevice[0], 201);
    } catch (error) {
        console.error('Error creating brew device:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});
app.put('/brew-devices/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const deviceId = c.req.param('id');
    try {
        const { name, type, notes } = await c.req.json();
        if (!name || typeof name !== 'string') {
            return c.json({ message: 'Device name is required' }, 400);
        }

        const updatedDevice = await db.update(schema.brewDevicesTable)
        .set({
            name: name,
            type: type || null,
            notes: notes || null,
            updatedAt: new Date(),
        })
        .where(and(eq(schema.brewDevicesTable.id, deviceId), eq(schema.brewDevicesTable.userId, userId)))
        .returning();

        if (updatedDevice.length === 0) {
        return c.json({ message: 'Brew device not found or update failed' }, 404);
        }
        return c.json(updatedDevice[0]);
    } catch (error) {
        console.error('Error updating brew device:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});
app.delete('/brew-devices/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const deviceId = c.req.param('id');
    try {
        const deletedDevice = await db.delete(schema.brewDevicesTable)
        .where(and(eq(schema.brewDevicesTable.id, deviceId), eq(schema.brewDevicesTable.userId, userId)))
        .returning({ id: schema.brewDevicesTable.id });

        if (deletedDevice.length === 0) {
            return c.json({ message: 'Brew device not found or delete failed' }, 404);
        }
        return c.json({ message: 'Brew device deleted successfully' });
    } catch (error) {
        console.error('Error deleting brew device:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});

// --- Grinders API Routes ---
app.get('/grinders', authMiddleware, async (c) => {
    const userId = c.get('userId');
    try {
        const grinders = await db.select()
        .from(schema.grindersTable)
        .where(eq(schema.grindersTable.userId, userId))
        .orderBy(schema.grindersTable.createdAt);
        return c.json(grinders);
    } catch (error) {
        console.error('Error fetching grinders:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});
app.post('/grinders', authMiddleware, async (c) => {
    const userId = c.get('userId');
    try {
        const { name, type, notes } = await c.req.json();
        if (!name || typeof name !== 'string') {
            return c.json({ message: 'Grinder name is required' }, 400);
        }

        const newGrinder = await db.insert(schema.grindersTable)
        .values({
            userId: userId,
            name: name,
            type: type || null,
            notes: notes || null,
        })
        .returning();

        if (newGrinder.length === 0) {
            throw new Error('Failed to create grinder.')
        }
        return c.json(newGrinder[0], 201);
    } catch (error) {
        console.error('Error creating grinder:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});
app.put('/grinders/:id', authMiddleware, async (c) => {
     const userId = c.get('userId');
    const grinderId = c.req.param('id');
    try {
        const { name, type, notes } = await c.req.json();
        if (!name || typeof name !== 'string') {
            return c.json({ message: 'Grinder name is required' }, 400);
        }

        const updatedGrinder = await db.update(schema.grindersTable)
        .set({
            name: name,
            type: type || null,
            notes: notes || null,
            updatedAt: new Date(),
        })
        .where(and(eq(schema.grindersTable.id, grinderId), eq(schema.grindersTable.userId, userId)))
        .returning();

        if (updatedGrinder.length === 0) {
            return c.json({ message: 'Grinder not found or update failed' }, 404);
        }
        return c.json(updatedGrinder[0]);
    } catch (error) {
        console.error('Error updating grinder:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});
app.delete('/grinders/:id', authMiddleware, async (c) => {
     const userId = c.get('userId');
    const grinderId = c.req.param('id');
     try {
        const deletedGrinder = await db.delete(schema.grindersTable)
        .where(and(eq(schema.grindersTable.id, grinderId), eq(schema.grindersTable.userId, userId)))
        .returning({ id: schema.grindersTable.id });

        if (deletedGrinder.length === 0) {
            return c.json({ message: 'Grinder not found or delete failed' }, 404);
        }
        return c.json({ message: 'Grinder deleted successfully' });
    } catch (error) {
        console.error('Error deleting grinder:', error);
        return c.json({ message: 'Internal Server Error' }, 500);
    }
});


// --- Vercel Export ---
// Use the Hono Vercel adapter
export default handle(app);
// Ensure NO Edge runtime specification

export const runtime = 'edge'; // <-- Restore Edge runtime
// export default handle(app); 