import { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import dayjs from 'dayjs';

// Serverside-only environment variable
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper function to format time in MM:SS format
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Helper function to calculate age in days
function calculateAgeDays(roastedDate: number | undefined): string {
  if (!roastedDate) return 'N/A';
  const roastDay = dayjs(roastedDate);
  const today = dayjs();
  return today.diff(roastDay, 'day').toString();
}

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
    // Extract parameters from request body
    const { 
      beanName, 
      country, 
      process, 
      roastLevel, 
      flavorNotes, 
      brewMethod, 
      roastedDate 
    } = req.body;
    
    if (!beanName || !brewMethod) {
      return res.status(400).json({ error: 'Missing required parameters: beanName and brewMethod are required' });
    }

    // Calculate bean age
    const beanAge = calculateAgeDays(roastedDate);

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    // Construct the prompt
    const prompt = `Please suggest optimal brewing parameters for the following coffee:

Bean Name: ${beanName}
Origin: ${country || 'Unknown'}
Process: ${process || 'Unknown'}
Roast Level: ${roastLevel || 'Unknown'}
Flavor Notes: ${flavorNotes ? flavorNotes.join(', ') : 'Unknown'}
Bean Age (days since roast): ${beanAge}
Brew Method: ${brewMethod}

Provide brew parameters optimized for this specific coffee's characteristics. 
Return ONLY a JSON object with the following structure without any text outside the JSON:
{
  "suggestion": "A brief explanation of why these parameters would work well with this coffee (2-3 sentences)",
  "grindSize": "Suggested grind size (e.g. Fine, Medium-Fine, Medium, Medium-Coarse, Coarse)",
  "waterTemp": 93,
  "steepTime": 150,
  "useBloom": true,
  "bloomTime": 30
}

Note that waterTemp is in Celsius, steepTime and bloomTime are in seconds. useBloom is a boolean.`;

    // Make OpenAI API call
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    });

    const messageContent = response.choices[0]?.message?.content;
    
    if (!messageContent) {
      return res.status(500).json({ error: 'No message content received from OpenAI API' });
    }

    // Try to parse the response as JSON
    try {
      const jsonResponse = JSON.parse(messageContent);
      
      // Format times for display
      if (jsonResponse.steepTime) {
        jsonResponse.steepTimeFormatted = formatTime(jsonResponse.steepTime);
      }
      
      if (jsonResponse.bloomTime) {
        jsonResponse.bloomTimeFormatted = formatTime(jsonResponse.bloomTime);
      }
      
      return res.status(200).json(jsonResponse);
    } catch (error) {
      // If parsing fails, try to extract the JSON using regex
      const jsonMatch = messageContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extractedJson = JSON.parse(jsonMatch[0]);
          
          // Format times for display
          if (extractedJson.steepTime) {
            extractedJson.steepTimeFormatted = formatTime(extractedJson.steepTime);
          }
          
          if (extractedJson.bloomTime) {
            extractedJson.bloomTimeFormatted = formatTime(extractedJson.bloomTime);
          }
          
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