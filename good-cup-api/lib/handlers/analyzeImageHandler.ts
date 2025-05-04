// api/analyze-image.ts - Handles POST for image analysis

import { OpenAI } from 'openai';
import { verifyAuthToken } from '../auth'; // Corrected path
import type { Context } from 'hono'; // Import Hono Context

// Helper function to extract JSON from potentially formatted string
function extractJson(content: string | null | undefined): any | null {
  if (!content) return null;
  content = content.trim();
  const codeFenceMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeFenceMatch && codeFenceMatch[1]) {
    content = codeFenceMatch[1].trim();
  } else {
    const genericCodeFenceMatch = content.match(/```\s*([\s\S]*?)\s*```/);
    if (genericCodeFenceMatch && genericCodeFenceMatch[1]) {
      content = genericCodeFenceMatch[1].trim();
    }
    else if (content.startsWith('{') && content.endsWith('}')) { /* Raw JSON */ }
    else {
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
    return null;
  }
}

// Define expected request body structure based on usage below
interface AnalyzeImageRequest {
    image: string;
}

// Define expected successful response structure based on prompt
interface AnalyzeImageResponse {
  beanName: string | null;
  roastLevel: string | null;
  flavorNotes: string[] | null;
  description: string | null;
  roastedDate: string | null;
  origin: string | null;
}

// Updated function signature for Hono
export async function handleAnalyzeImage(c: Context): Promise<Response> {
    console.log('[handleAnalyzeImage] Function invoked');

    // --- Authentication using Hono middleware pattern --- 
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) {
        console.warn('[handleAnalyzeImage] Authentication failed:', authResult.error);
        // Throw error for Hono's error handling
        throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
    }
    console.log(`[handleAnalyzeImage] Authenticated user: ${authResult.userId}`);
    // userId is available if needed later: const userId = authResult.userId;

    // --- Get OpenAI API Key --- 
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        console.error("[handleAnalyzeImage] Missing OpenAI API key");
        throw { status: 500, message: 'Server configuration error: Missing OpenAI API key' };
    }

    try {
        // --- Parse Request Body --- 
        // Use c.req.json() for Hono
        const body: AnalyzeImageRequest = await c.req.json(); 
        const { image } = body;
        
        if (!image || typeof image !== 'string' || image.trim() === '') {
            console.warn('[handleAnalyzeImage] Bad Request: Missing or invalid image data');
            throw { status: 400, message: 'Missing required parameter: image (must be a non-empty base64 string)' };
        }

        // --- OpenAI API Call (Keep prompt and model as pasted) --- 
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        // --- DO NOT CHANGE THIS PROMPT --- 
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
        // --- END DO NOT CHANGE PROMPT --- 

        console.log('[handleAnalyzeImage] Sending request to OpenAI...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4.1-2025-04-14', // Keep model as specified in pasted code
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                // Use base64 string directly from request body
                                url: `data:image/jpeg;base64,${image}`,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 500, // Keep max_tokens as specified
        });

        const messageContent = response.choices[0]?.message?.content;
        if (!messageContent) {
            console.error('[handleAnalyzeImage] No message content received from OpenAI API');
            throw { status: 500, message: 'No message content received from OpenAI API' };
        }

        console.log('[handleAnalyzeImage] Received response from OpenAI, attempting to extract JSON.');
        // --- Use the existing extractJson function --- 
        const jsonResponse: AnalyzeImageResponse | null = extractJson(messageContent);

        if (jsonResponse) {
            console.log('[handleAnalyzeImage] Successfully extracted JSON response.');
            // Return success response using Hono context
            return c.json(jsonResponse, 200);
        } else {
            console.error('[handleAnalyzeImage] Failed to extract/parse OpenAI response:', messageContent);
            // Throw error for Hono
            throw { 
                status: 500, 
                message: 'Failed to parse AI response as JSON', 
                rawResponse: messageContent // Include raw response for debugging
            };
        }

    } catch (error: any) {
        console.error('[handleAnalyzeImage] Error during processing:', error);
        // Re-throw structured error for Hono middleware
        // If the error already has a status, use it, otherwise default to 500
        const status = typeof error.status === 'number' ? error.status : 500;
        const message = error.message || 'Internal Server Error';
        // Include rawResponse if it was part of a thrown error
        const details = error.rawResponse || (process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : String(error)) : undefined);

        // Ensure we throw an object Hono can handle
        throw { status, message, details }; 
    }
} 