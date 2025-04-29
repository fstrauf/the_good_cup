import crypto from 'crypto'; 
import { OpenAI } from 'openai';
import { verifyAuthToken } from '../lib/auth';
import { getBodyJSON } from '../lib/utils';

// --- JSON Extraction Helper ---
function extractJson(content: string | null): any | null {
  if (!content) return null;
  content = content.trim();
  const codeFenceMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeFenceMatch && codeFenceMatch[1]) {
    content = codeFenceMatch[1].trim();
  } else {
    const genericCodeFenceMatch = content.match(/```\s*([\s\S]*?)\s*```/);
    if (genericCodeFenceMatch && genericCodeFenceMatch[1]) {
      content = genericCodeFenceMatch[1].trim();
    } else if (content.startsWith('{') && content.endsWith('}')) {
      // Assume raw JSON
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
    console.error("[analyze-image.ts:JSONExtract:Error] Failed to parse:", content, e);
    return null;
  }
}
// --- End JSON Extraction Helper ---


// --- Vercel Request Handler for POST /api/analyze-image ---
export default async (req: any, res: any) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    console.log('[analyze-image.ts] POST handler invoked');

    // --- Auth Check ---
    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        console.log(`[analyze-image.ts:AuthFail] ${authResult.status} ${authResult.error}`);
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }
    // --- End Auth Check ---

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        console.error('[analyze-image.ts:Error] OPENAI_API_KEY missing.');
        return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
    }

    try {
        const { image } = await getBodyJSON(req);
        if (!image) {
            return res.status(400).json({ error: 'Missing required parameter: image (base64 string)' });
        }

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        // Keep prompt from JS file, adjust if needed
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

        console.log('[analyze-image.ts] Sending request to OpenAI...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Use desired model
            messages: [
                {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    {
                    type: 'image_url',
                    image_url: {
                        // Ensure image is a base64 string without data URI prefix if needed by API
                        url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
                    },
                    },
                ],
                },
            ],
            max_tokens: 500, // Adjust as needed
        });

        const messageContent = response.choices[0]?.message?.content;
        if (!messageContent) {
            console.error('[analyze-image.ts:Error] No message content from OpenAI');
            return res.status(500).json({ error: 'No message content received from OpenAI API' });
        }

        console.log('[analyze-image.ts] Received response from OpenAI, extracting JSON...');
        const jsonResponse = extractJson(messageContent);

        if (jsonResponse) {
            console.log('[analyze-image.ts] Successfully parsed OpenAI response.');
            return res.status(200).json(jsonResponse);
        } else {
            console.error('[analyze-image.ts:Error] Failed to parse OpenAI response as JSON:', messageContent);
            return res.status(500).json({ 
                error: 'Failed to parse AI response as JSON', 
                rawResponse: messageContent 
            });
        }

    } catch (error) {
        console.error('[analyze-image.ts:Error] Error processing analysis:', error);
        return res.status(500).json({ 
            status: 'error', 
            message: 'Internal Server Error during image analysis', 
            details: error instanceof Error ? error.message : String(error) 
        });
    }
}; 