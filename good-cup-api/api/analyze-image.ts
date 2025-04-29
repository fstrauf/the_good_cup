// api/analyze-image.ts - Handles POST for image analysis

import { VercelRequest, VercelResponse } from '@vercel/node';
const { OpenAI } = require('openai');
import { verifyJwt, JWT_SECRET } from '../lib/auth'; // Adjust path as needed

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

export default async (req: VercelRequest, res: VercelResponse) => {
    // --- CORS Handling ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // --- Authentication ---
    // Although userId isn't used, keep auth check to protect the endpoint
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            if (!JWT_SECRET) {
                console.error("Auth error: JWT_SECRET missing");
                return res.status(500).json({ message: 'Server configuration error' });
            }
            const decoded = verifyJwt(token, JWT_SECRET);
            if (!decoded || !decoded.userId) {
                return res.status(401).json({ message: 'Invalid token payload' });
            }
            userId = decoded.userId as string; // Store it even if unused for now
        } catch (error) {
            console.error("Token verification failed:", error);
            const isExpired = error instanceof Error && error.message === 'JwtTokenExpired';
            return res.status(401).json({ message: isExpired ? 'Token expired' : 'Invalid or expired token' });
        }
    } else {
        return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }
    // --- End Authentication ---

    // Only handle POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        console.error("analyze-image: Missing OpenAI API key");
        return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
    }

    try {
        const { image }: { image?: string } = req.body || {};
        
        if (!image) {
            return res.status(400).json({ error: 'Missing required parameter: image' });
        }

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

        const response = await openai.chat.completions.create({
            model: 'gpt-4.1-2025-04-14',
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
            return res.status(500).json({ error: 'No message content received from OpenAI API' });
        }

        const jsonResponse = extractJson(messageContent);

        if (jsonResponse) {
            return res.status(200).json(jsonResponse);
        } else {
            console.error('Failed to extract/parse OpenAI response:', messageContent);
            return res.status(500).json({ 
                error: 'Failed to parse AI response as JSON',
                rawResponse: messageContent
            });
        }

    } catch (error: any) {
        console.error('Error processing analyze-image:', error);
        const errorMessage = process.env.NODE_ENV === 'production' 
            ? 'Internal Server Error' 
            : error instanceof Error ? error.message : String(error);
        return res.status(500).json({
            error: 'Internal server error',
            details: errorMessage
        });
    }
}; 