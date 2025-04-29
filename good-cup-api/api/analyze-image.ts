// Image Analysis handler for Vercel serverless function
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
// Keep OpenAI import as commonjs require for now
const { OpenAI } = require('openai');
// Import auth helpers (assuming path relative to api directory)
import { verifyJwt, JWT_SECRET } from '../lib/auth';

// Define types for Hono context variables
type HonoEnv = {
  Variables: {
    userId: string; // Keep userId in context even if not directly used by analysis
  }
}

// Helper function to extract JSON from potentially formatted string
function extractJson(content: string | null | undefined): any | null {
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
}

// Optional: Set to 'edge' if preferred
// export const runtime = 'edge';

const app = new Hono<HonoEnv>().basePath('/api/analyze-image');

// --- Authentication Middleware --- 
// (Important for protecting the endpoint, even if userId isn't used in core logic)
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

// --- Route Handler --- 

// POST /api/analyze-image
app.post('/', async (c) => {
  // const userId = c.get('userId'); // User ID available if needed later

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error("analyze-image: Missing OpenAI API key");
    return c.json({ error: 'Server configuration error: Missing OpenAI API key' }, 500);
  }

  try {
    // Get image from request body using Hono context
    const { image }: { image?: string } = await c.req.json();
    
    if (!image) {
      return c.json({ error: 'Missing required parameter: image' }, 400);
    }

    // Keep the OpenAI client initialization and prompt logic
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const prompt = `Analyze this coffee bean package image and extract the following information:
1. Bean Name: The name of the coffee beans
2. Roast Level: The roast level (light, medium, dark, etc.)
3. Flavor Notes: The flavor notes mentioned on the package
4. Description: A description of the coffee beans
5. Roast Date: The date the beans were roasted
6. Origin: The origin of the coffee beans

Return ONLY a JSON object with the following structure without any text outside the JSON:
{
  "beanName": "Name of the coffee beans (infer this from the description if necessary",
  "roastLevel": ["Light","Medium-Light", "Medium", "Medium-Dark", "Dark"],
  "flavorNotes": ["Note 1", "Note 2", "Note 3"],
  "description": "Description of the coffee beans",
  "roastedDate": "Date the beans were roasted",
  "origin": "Origin of the coffee beans"
}

If any information is not visible or cannot be determined from the image, use null for that field.`;

    // Keep the OpenAI API call logic
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-2025-04-14', // Consider making model configurable
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

    // Keep the response processing logic
    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return c.json({ error: 'No message content received from OpenAI API' }, 500);
    }

    const jsonResponse = extractJson(messageContent);

    if (jsonResponse) {
      // Return response using Hono context
      return c.json(jsonResponse);
    } else {
      console.error('Failed to extract/parse OpenAI response:', messageContent);
      // Return error using Hono context
      return c.json({ 
        error: 'Failed to parse AI response as JSON',
        rawResponse: messageContent
      }, 500);
    }

  } catch (error) {
    console.error('Error processing analyze-image:', error);
    // Return error using Hono context
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Export the Hono app handler for Vercel
export default handle(app); 