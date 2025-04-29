import { Hono, Context } from 'hono';
import { handle } from 'hono/vercel'; // Keep commented for node server
import { sign, verify } from 'hono/jwt';
import { eq, and, desc } from 'drizzle-orm';
import OpenAI from 'openai';

// Drizzle Imports
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
// Import tables from schema.ts
import * as schema from './schema'; // Import all exports as 'schema'
// We also need the usersTable specifically for some queries, let's import it directly
import { usersTable } from './schema';

// Create the DB client directly in this file
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}
const sql = neon(connectionString);
console.log('Neon client initialized.'); // Log after Neon init

console.log('Initializing Drizzle client...'); // Log before Drizzle init
// Use the imported schema object for the client
// const db = drizzle(sql, { schema, logger: true }); // <-- COMMENT OUT for testing
console.log('Drizzle client initialization SKIPPED at top level.'); // Log after Drizzle init
// --- End logging around DB setup ---

// Restore constants
const JWT_SECRET = process.env.JWT_SECRET;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Web Crypto Helper Functions ---
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

// Function to convert ArrayBuffer to Base64 string (Edge compatible)
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// Function to convert Base64 string to Uint8Array (Edge compatible)
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
};

// Function to hash password using PBKDF2 with Web Crypto
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
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
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_LENGTH_BYTES * 8 // length in bits
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
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_LENGTH_BYTES * 8 // length in bits
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
    // Add other variables here if needed later (e.g., jwtPayload)
  }
}

// --- Authentication Middleware ---
// Update middleware signature to use typed context
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
    // Add userId to the context (type is now inferred correctly)
    c.set('userId', payload.userId as string); 
    await next(); // Proceed to the next handler/middleware
  } catch (error) {
    console.error('Token verification failed:', error);
    // Differentiate between expired and invalid signature if needed
    if (error instanceof Error && error.name === 'JwtTokenExpired') {
      return c.json({ message: 'Unauthorized: Token expired' }, 401);
    }
    return c.json({ message: 'Unauthorized: Invalid token' }, 401);
  }
};
// --- End Authentication Middleware ---

// Use standard Hono app, initialize with types
const app = new Hono<HonoEnv>();

// Add a root route for testing
app.get('/', (c) => {
  console.log('--- Root GET handler invoked ---');
  return c.json({ message: 'Hono root says hello!' });
});

// --- Helper Functions --- 
const formatTime = (totalSeconds: number): string => {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

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

// Helper function to extract JSON from potentially formatted string
const extractJson = (content: string | null): any | null => {
  if (!content) return null;
  content = content.trim(); // Trim whitespace first

  // Check for markdown code fence (json specifically)
  const codeFenceMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeFenceMatch && codeFenceMatch[1]) {
    content = codeFenceMatch[1].trim();
  } else {
    // Fallback: Check for generic code fence
    const genericCodeFenceMatch = content.match(/```\s*([\s\S]*?)\s*```/);
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

// --- Login Route --- 
// Note: We're using a standalone login.js file for Vercel and skipping this route
// This is kept for local development with the server.ts
// Vercel uses /api/auth/login.js instead
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
    // For testing in development
    if (email === 'test@example.com' && password === 'password123') {
      const tokenPayload = {
        userId: 'test-user-123',
        email,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
      };

      const token = await sign(tokenPayload, JWT_SECRET);

      return c.json({
        token,
        user: {
          id: 'test-user-123',
          email,
          name: 'Test User',
        },
      });
    }

    // Use db defined in this file's scope
    const foundUsers = await db.select()
                             .from(usersTable)
                             .where(eq(usersTable.email, email.toLowerCase()))
                             .limit(1);

    if (foundUsers.length === 0) {
      return c.json({ message: 'Invalid email or password.' }, 401);
    }
    const user = foundUsers[0];

    // Use the new verifyPassword function
    const passwordMatches = await verifyPassword(password, user.passwordHash);

    if (!passwordMatches) {
      return c.json({ message: 'Invalid email or password.' }, 401);
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // Expires: now + 7 days
    };

    // Use Hono's sign function
    const token = await sign(tokenPayload, JWT_SECRET);

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

    // Use the new hashPassword function
    const passwordHash = await hashPassword(password);

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

// --- Analyze Image Route --- 
app.post('/analyze-image', async (c) => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return c.json({ error: 'Server configuration error: Missing OpenAI API key' }, 500);
  }

  // Authorization check (consider middleware later)
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { image } = await c.req.json();
    if (!image) {
      return c.json({ error: 'Missing required parameter: image' }, 400);
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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

    // Use the helper function to extract and parse
    const jsonResponse = extractJson(messageContent);

    if (jsonResponse) {
      return c.json(jsonResponse);
    } else {
      console.error('Failed to extract/parse OpenAI response:', messageContent);
      return c.json({ 
          error: 'Failed to parse AI response as JSON',
          rawResponse: messageContent // Send raw response for debugging
        }, 500);
    }

  } catch (error: unknown) {
    console.error('Error processing /analyze-image:', error);
    return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// --- Brew Suggestions Route (based on history) ---
// Define Brew interface (if not already defined globally)
interface Brew {
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

app.post('/brew-suggestions', async (c) => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return c.json({ error: 'Server configuration error: Missing OpenAI API key' }, 500);
  }

  // Authorization check
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { currentBrew, previousBrews, selectedBeanName, currentGrinderName } = await c.req.json();
    
    if (!currentBrew) {
      return c.json({ error: 'Missing required parameter: currentBrew' }, 400);
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const currentBrewAge = calculateAgeDays(currentBrew.roastedDate, currentBrew.timestamp);

    let prompt = `As a coffee expert, I'm analyzing a brew of ${currentBrew.beanName}. Here are the details:

Current Brew:
- Steep Time: ${formatTime(currentBrew.steepTime)}
- Grind Size: ${currentBrew.grindSize}
- Water Temperature: ${currentBrew.waterTemp}
${currentBrew.useBloom ? `- Bloom: Yes (${currentBrew.bloomTime || 'unspecified time'})` : '- Bloom: No'}
${currentBrew.brewDevice ? `- Brewing Device: ${currentBrew.brewDevice}` : ''}
${currentBrew.grinder ? `- Grinder: ${currentBrew.grinder}` : ''}
${currentBrew.notes ? `- Notes: ${currentBrew.notes}` : ''}
${currentBrew.rating ? `- Rating: ${currentBrew.rating}/10` : ''}
${currentBrew.roastedDate ? `- Roasted Date: ${new Date(currentBrew.roastedDate).toLocaleDateString()}` : ''}
${currentBrewAge !== null ? `- Age When Brewed: ${currentBrewAge} days` : ''}
`;

    if (previousBrews && previousBrews.length > 0) {
      prompt += `\nRelevant previous brews of the same bean (sorted by rating):\n`;
      previousBrews.forEach((brew: Brew, index: number) => {
        const prevBrewAge = calculateAgeDays(brew.roastedDate, brew.timestamp);
        prompt += `\nBrew #${index + 1} (Rating: ${brew.rating}/10):
- Steep Time: ${formatTime(brew.steepTime)}
- Grind Size: ${brew.grindSize}
- Water Temperature: ${brew.waterTemp}
${brew.useBloom ? `- Bloom: Yes (${brew.bloomTime || 'unspecified time'})` : '- Bloom: No'}
${brew.notes ? `- Notes: ${brew.notes}` : ''}
${prevBrewAge !== null ? `- Age When Brewed: ${prevBrewAge} days` : ''}
`;
      });
    }

    prompt += `
Based on the current brew and any previous brews of the same bean, please provide concise suggestions to improve the brewing process. Consider these factors:
1. Grind size adjustments
2. Steep time modifications
3. Water temperature changes
4. Bloom technique
5. Any other techniques that might enhance the flavor

Please provide specific, actionable advice that would help achieve a better extraction and flavor profile.

If previous brews with the same grinder (${currentGrinderName || 'used previously'}) exist and used specific click settings (e.g., "18 clicks"), base your grind size suggestion on those clicks (e.g., suggest "17 clicks" or "19 clicks"). Otherwise, provide a descriptive suggestion (e.g., "Medium-Fine").

Return the response ONLY as a valid JSON object with the exact structure below. Do NOT include any explanatory text, greetings, apologies, or markdown formatting (like \`\`\`) before or after the JSON object.

{
  "suggestionText": "<Your detailed textual suggestions here>",
  "suggestedGrindSize": "<Specific suggested grind size in clicks, e.g., '17, 25, 35', or null if no specific suggestion>",
  "suggestedWaterTemp": "<Specific water temperature, e.g., '96°C', or null>",
  "suggestedSteepTimeSeconds": <Steep time in total seconds, e.g., 180, or null>,
  "suggestedUseBloom": <boolean, true if bloom is recommended, false otherwise>,
  "suggestedBloomTimeSeconds": <Bloom time in seconds, e.g., 30, or null if bloom is not recommended or time is unspecified>
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo', // Consider model choice
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return c.json({ error: 'No message content received from OpenAI API' }, 500);
    }

    // Use the helper function to extract and parse
    const jsonResponse = extractJson(messageContent);

    if (jsonResponse) {
       // Add any necessary type checks if needed here before returning
      return c.json(jsonResponse);
    } else {
      console.error('Failed to extract/parse OpenAI response:', messageContent);
      return c.json({ 
          error: 'Failed to parse AI response as JSON',
          rawResponse: messageContent
        }, 500);
    }

  } catch (error: unknown) {
    console.error('Error processing /brew-suggestions:', error);
    return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// --- Brew Suggestion Route (Generic based on bean) ---
app.post('/brew-suggestion', async (c) => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return c.json({ error: 'Server configuration error: Missing OpenAI API key' }, 500);
  }

  // Authorization check
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { 
      beanName, 
      country, 
      process, 
      roastLevel, 
      flavorNotes, 
      brewMethod, 
      roastedDate 
    } = await c.req.json();
    
    if (!beanName || !brewMethod) {
      return c.json({ error: 'Missing required parameters: beanName and brewMethod are required' }, 400);
    }

    // Calculate bean age (using existing helper)
    const beanAge = roastedDate ? calculateAgeDays(roastedDate, Date.now()) : null; // Age relative to today

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const prompt = `Please suggest optimal brewing parameters for the following coffee:

Bean Name: ${beanName}
Origin: ${country || 'Unknown'}
Process: ${process || 'Unknown'}
Roast Level: ${roastLevel || 'Unknown'}
Flavor Notes: ${flavorNotes ? flavorNotes.join(', ') : 'Unknown'}
Bean Age (days since roast): ${beanAge !== null ? beanAge : 'Unknown'}
Brew Method: ${brewMethod}

Provide brew parameters optimized for this specific coffee's characteristics. 
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

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Use a suitable model
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return c.json({ error: 'No message content received from OpenAI API' }, 500);
    }

    // Use the helper function to extract and parse
    const jsonResponse = extractJson(messageContent);

    if (jsonResponse) {
       // Add formatted times for convenience (optional, can be done on client)
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

// --- Brew Devices API Routes ---
// Initialize sub-router with types
const brewDeviceRoutes = new Hono<HonoEnv>();

// Apply auth middleware to all brew device routes
brewDeviceRoutes.use('*', authMiddleware);

// GET /brew-devices - List all devices for the user
brewDeviceRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  try {
    const devices = await db.select()
      .from(schema.brewDevicesTable)
      .where(eq(schema.brewDevicesTable.userId, userId))
      .orderBy(schema.brewDevicesTable.createdAt); // Optional: order by creation date
    return c.json(devices);
  } catch (error) {
    console.error('Error fetching brew devices:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// POST /brew-devices - Create a new device
brewDeviceRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const { name, type, notes } = await c.req.json();

  if (!name || typeof name !== 'string') {
    return c.json({ message: 'Device name is required' }, 400);
  }

  try {
    const newDevice = await db.insert(schema.brewDevicesTable)
      .values({
        userId: userId,
        name: name,
        type: type || null,
        notes: notes || null,
      })
      .returning(); // Return the newly created device
      
    if (newDevice.length === 0) {
        throw new Error('Failed to create brew device.')
    }
    return c.json(newDevice[0], 201);
  } catch (error) {
    console.error('Error creating brew device:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// PUT /brew-devices/:id - Update an existing device
brewDeviceRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const deviceId = c.req.param('id');
  const { name, type, notes } = await c.req.json();

  if (!name || typeof name !== 'string') {
    return c.json({ message: 'Device name is required' }, 400);
  }

  try {
    const updatedDevice = await db.update(schema.brewDevicesTable)
      .set({
        name: name,
        type: type || null,
        notes: notes || null,
        updatedAt: new Date(), // Update the timestamp
      })
      .where(and(eq(schema.brewDevicesTable.id, deviceId), eq(schema.brewDevicesTable.userId, userId))) // Ensure user owns the device
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

// DELETE /brew-devices/:id - Delete a device
brewDeviceRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const deviceId = c.req.param('id');

  try {
    const deletedDevice = await db.delete(schema.brewDevicesTable)
      .where(and(eq(schema.brewDevicesTable.id, deviceId), eq(schema.brewDevicesTable.userId, userId))) // Ensure user owns the device
      .returning({ id: schema.brewDevicesTable.id }); // Return the id of the deleted item

    if (deletedDevice.length === 0) {
      return c.json({ message: 'Brew device not found or delete failed' }, 404);
    }
    return c.json({ message: 'Brew device deleted successfully' }); // Use 200 OK or 204 No Content
  } catch (error) {
    // Handle potential foreign key constraint errors if brews reference this device
    console.error('Error deleting brew device:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// Mount the brew device routes under the main app
app.route('/brew-devices', brewDeviceRoutes);

// --- Grinders API Routes ---
const grinderRoutes = new Hono<HonoEnv>();

// Apply auth middleware to all grinder routes
grinderRoutes.use('*', authMiddleware);

// GET /grinders - List all grinders for the user
grinderRoutes.get('/', async (c) => {
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

// POST /grinders - Create a new grinder
grinderRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const { name, type, notes } = await c.req.json();

  if (!name || typeof name !== 'string') {
    return c.json({ message: 'Grinder name is required' }, 400);
  }

  try {
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

// PUT /grinders/:id - Update an existing grinder
grinderRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const grinderId = c.req.param('id');
  const { name, type, notes } = await c.req.json();

  if (!name || typeof name !== 'string') {
    return c.json({ message: 'Grinder name is required' }, 400);
  }

  try {
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

// DELETE /grinders/:id - Delete a grinder
grinderRoutes.delete('/:id', async (c) => {
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

// Mount the grinder routes under the main app
app.route('/grinders', grinderRoutes);
// --- End Grinders API Routes ---

// --- User Settings API Routes ---
const settingsRoutes = new Hono<HonoEnv>();

// Apply auth middleware
settingsRoutes.use('*', authMiddleware);

// GET /settings - Get user default device/grinder
settingsRoutes.get('/', async (c) => {
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
      // Return defaults if no settings found for the user
      return c.json({ defaultBrewDeviceId: null, defaultGrinderId: null });
    }
  } catch (error) {
    console.error('Error fetching user settings:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// PUT /settings - Update or create user default device/grinder
settingsRoutes.put('/', async (c) => {
  const userId = c.get('userId');
  const { defaultBrewDeviceId, defaultGrinderId } = await c.req.json();

  // Basic validation (could add check if IDs actually exist in respective tables)
  if (defaultBrewDeviceId !== null && typeof defaultBrewDeviceId !== 'string') {
    return c.json({ message: 'Invalid format for defaultBrewDeviceId' }, 400);
  }
   if (defaultGrinderId !== null && typeof defaultGrinderId !== 'string') {
    return c.json({ message: 'Invalid format for defaultGrinderId' }, 400);
  }

  try {
    const upsertedSettings = await db.insert(schema.userSettingsTable)
      .values({
        userId: userId,
        defaultBrewDeviceId: defaultBrewDeviceId || null,
        defaultGrinderId: defaultGrinderId || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({ 
        target: schema.userSettingsTable.userId, // Specify the conflict target (the primary key)
        set: { // Specify what to update on conflict
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
        throw new Error('Failed to update/create user settings.')
    }

    return c.json(upsertedSettings[0]);
  } catch (error) {
    console.error('Error updating user settings:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// Mount the settings routes under the main app
app.route('/settings', settingsRoutes);
// --- End User Settings API Routes ---

// --- Beans API Routes ---
// Apply auth middleware directly to the route
app.get('/beans', authMiddleware, async (c) => {
  const userId = c.get('userId');
  try {
    const beans = await db.select()
      .from(schema.beansTable)
      .where(eq(schema.beansTable.userId, userId))
      .orderBy(schema.beansTable.createdAt); // Or by name, roast date etc.
    return c.json(beans);
  } catch (error) {
    console.error('Error fetching beans:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// POST /beans - Create a new bean (Keep using middleware)
app.post('/beans', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  // Basic validation
  if (!body.name || typeof body.name !== 'string') {
    return c.json({ message: 'Bean name is required' }, 400);
  }
  // Add more validation as needed (e.g., for roastedDate format)

  try {
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
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// GET /beans/:id - Get a specific bean (Keep using middleware)
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

// PUT /beans/:id - Update an existing bean (Keep using middleware)
app.put('/beans/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const beanId = c.req.param('id');
  const body = await c.req.json();

  if (!body.name || typeof body.name !== 'string') {
    return c.json({ message: 'Bean name is required' }, 400);
  }
  // Add more validation

  try {
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

// DELETE /beans/:id - Delete a bean (Keep using middleware)
app.delete('/beans/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const beanId = c.req.param('id');

  try {
    // Consider implications: deleting a bean might require deleting associated brews
    // depending on foreign key constraints (ON DELETE CASCADE was set in schema)
    const deletedBean = await db.delete(schema.beansTable)
      .where(and(eq(schema.beansTable.id, beanId), eq(schema.beansTable.userId, userId)))
      .returning({ id: schema.beansTable.id });

    if (deletedBean.length === 0) {
      return c.json({ message: 'Bean not found or delete failed' }, 404);
    }
    // Deleting the bean will cascade and delete related brews due to schema FK constraint
    return c.json({ message: 'Bean (and associated brews) deleted successfully' });
  } catch (error) {
    console.error('Error deleting bean:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// --- End Beans API Routes ---

// --- Brews API Routes ---
const brewsRoutes = new Hono<HonoEnv>();

// Apply auth middleware
brewsRoutes.use('*', authMiddleware);

// GET /brews - List brews for the user, optionally filtered by beanId
brewsRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const beanId = c.req.query('beanId'); // Get optional beanId query param

  try {
    // Build conditions array
    const conditions = [eq(schema.brewsTable.userId, userId)];
    if (beanId) {
      conditions.push(eq(schema.brewsTable.beanId, beanId));
    }

    // Apply conditions with and()
    const brews = await db.select()
      .from(schema.brewsTable)
      .where(and(...conditions)) // Use spread operator for conditions
      .orderBy(desc(schema.brewsTable.timestamp)); // Order by most recent

    return c.json(brews);
  } catch (error) {
    console.error('Error fetching brews:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
});

// POST /brews - Create a new brew log
brewsRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  // --- Validation --- 
  if (!body.beanId || typeof body.beanId !== 'string') {
    return c.json({ message: 'beanId is required' }, 400);
  }
  if (body.timestamp === undefined || typeof body.timestamp !== 'number') {
    // Assuming timestamp is sent as Unix epoch ms from client
    return c.json({ message: 'timestamp (number) is required' }, 400);
  }
  // Add validation for other required fields like steepTime, rating etc. if needed
  // Check if referenced beanId, brewDeviceId, grinderId exist and belong to the user? (optional, adds complexity)

  try {
    const newBrew = await db.insert(schema.brewsTable)
      .values({
        userId: userId,
        beanId: body.beanId,
        brewDeviceId: body.brewDeviceId || null,
        grinderId: body.grinderId || null,
        timestamp: new Date(body.timestamp), // Convert epoch ms to Date object
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

// GET /brews/:id - Get a specific brew log
brewsRoutes.get('/:id', async (c) => {
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

// PUT /brews/:id - Update an existing brew log
brewsRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const brewId = c.req.param('id');
  const body = await c.req.json();

  // Add validation as needed
  if (body.timestamp === undefined || typeof body.timestamp !== 'number') {
     return c.json({ message: 'timestamp (number) is required' }, 400);
  }

  try {
    const updatedBrew = await db.update(schema.brewsTable)
      .set({
        // Cannot update beanId or userId
        brewDeviceId: body.brewDeviceId || null,
        grinderId: body.grinderId || null,
        timestamp: new Date(body.timestamp), // Convert epoch ms to Date object
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

// DELETE /brews/:id - Delete a brew log
brewsRoutes.delete('/:id', async (c) => {
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

// Mount the brews routes under the main app
app.route('/brews', brewsRoutes);
// --- End Brews API Routes ---

export { app }; // <-- Add named export for the Hono instance
export const runtime = 'edge'; // <-- Restore Edge runtime
export default handle(app); 