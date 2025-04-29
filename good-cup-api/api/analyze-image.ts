// Image Analysis handler for Vercel serverless function
import { VercelRequest, VercelResponse } from '@vercel/node';
const { OpenAI } = require('openai');

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

// Export the handler function using ES module syntax
export default async (req: VercelRequest, res: VercelResponse) => {
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Authentication check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
  }

  try {
    const { image } = req.body || {};
    
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

Return ONLY a JSON object with the following structure without any text outside the JSON:
{
  "beanName": "Name of the coffee beans (infer this from the description if necessary",
  "roastLevel": ["Light","Medium-Light", "Medium", "Medium-Dark", "Dark"],
  "flavorNotes": ["Note 1", "Note 2", "Note 3"],
  "description": "Description of the coffee beans",
  "roastedDate": "Date the beans were roasted"
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
      return res.status(500).json({ 
        error: 'No message content received from OpenAI API' 
      });
    }

    // Use the helper function to extract and parse
    const jsonResponse = extractJson(messageContent);

    if (jsonResponse) {
      return res.status(200).json(jsonResponse);
    } else {
      console.error('Failed to extract/parse OpenAI response:', messageContent);
      return res.status(500).json({ 
        error: 'Failed to parse AI response as JSON',
        rawResponse: messageContent // Send raw response for debugging
      });
    }
  } catch (error) {
    console.error('Error processing analyze-image:', error);
    return res.status(500).json({
      error: 'Internal server error',
      // Check if error is an Error instance before accessing message
      details: error instanceof Error ? error.message : String(error)
    });
  }
}; 