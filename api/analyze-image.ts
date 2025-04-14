import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Serverside-only environment variable
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Check for API key
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
  }

  // Check that this is a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Validate the authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Get base64 image from request
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'Missing required parameter: image' });
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    // Construct the prompt
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

    // Make OpenAI API call
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
      return res.status(500).json({ error: 'No message content received from OpenAI API' });
    }

    // Try to parse the response as JSON
    try {
      const jsonResponse = JSON.parse(messageContent);
      return res.status(200).json(jsonResponse);
    } catch (error) {
      // If parsing fails, try to extract the JSON using regex
      const jsonMatch = messageContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extractedJson = JSON.parse(jsonMatch[0]);
          return res.status(200).json(extractedJson);
        } catch (extractError) {
          return res.status(500).json({ 
            error: 'Failed to parse AI response as JSON',
            rawResponse: messageContent
          });
        }
      } else {
        return res.status(500).json({ 
          error: 'Failed to extract JSON from AI response',
          rawResponse: messageContent
        });
      }
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
} 