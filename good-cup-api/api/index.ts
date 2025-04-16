import { Hono } from 'hono';
import { handle } from 'hono/vercel'; // Keep commented for node server
import { sign } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import dayjs from 'dayjs';

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
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
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

// Use standard Hono app, remove basePath
const app = new Hono();

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

export { app }; // <-- Add named export for the Hono instance
export const runtime = 'edge';
export default handle(app); 