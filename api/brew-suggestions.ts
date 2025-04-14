import { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Define Brew interface
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

// Serverside-only environment variable
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper function to format time (copied from app-side)
const formatTime = (totalSeconds: number): string => {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// Helper function to calculate age in days (copied from app-side)
const calculateAgeDays = (roastedTimestamp?: number, brewTimestamp?: number): number | null => {
  if (!roastedTimestamp || !brewTimestamp) return null;
  const roastedDate = new Date(roastedTimestamp);
  const brewDate = new Date(brewTimestamp);
  
  // Set both times to the start of the day for accurate day difference
  roastedDate.setHours(0, 0, 0, 0);
  brewDate.setHours(0, 0, 0, 0);

  const differenceInTime = brewDate.getTime() - roastedDate.getTime();
  const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
  
  // Return null if roasted date is after brew date (should not happen)
  return differenceInDays >= 0 ? differenceInDays : null;
};

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
  
  // Validate the authorization header (use a more robust authentication system in production)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Extract parameters from request body
    const { currentBrew, previousBrews, selectedBeanName, currentGrinderName } = req.body;
    
    if (!currentBrew) {
      return res.status(400).json({ error: 'Missing required parameter: currentBrew' });
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    // Calculate age for the current brew
    const currentBrewAge = calculateAgeDays(currentBrew.roastedDate, currentBrew.timestamp);

    // Construct the prompt
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

    // Add information about previous brews if available
    if (previousBrews && previousBrews.length > 0) {
      prompt += `\nRelevant previous brews of the same bean (sorted by rating):\n`;
      
      previousBrews.forEach((brew: Brew, index: number) => {
        // Calculate age for previous brews as well
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

    // Make OpenAI API call
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-2025-04-14',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500
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
  } catch (error: unknown) {
    console.error('Error processing request:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
} 