// Unified brew suggestions handler for Vercel serverless function
import { VercelRequest, VercelResponse } from '@vercel/node'; // Import Vercel types
const { OpenAI } = require('openai');

// Format time helper function
function formatTime(totalSeconds: number) {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Helper function to calculate age in days
function calculateAgeDays(roastedTimestamp: string | number | null, brewTimestamp: string | number | null) {
  if (!roastedTimestamp || !brewTimestamp) return null;
  const roastedDate = new Date(roastedTimestamp);
  const brewDate = new Date(brewTimestamp);
  
  roastedDate.setHours(0, 0, 0, 0);
  brewDate.setHours(0, 0, 0, 0);

  const differenceInTime = brewDate.getTime() - roastedDate.getTime();
  const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
  
  return differenceInDays >= 0 ? differenceInDays : null;
}

// Helper function to extract JSON from potentially formatted string
function extractJson(content: string | null | undefined): any | null {
  if (!content) return null;
  content = content.trim();

  // Check for JSON code fence
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
    return null;
  }
}

// Define an interface for the expected structure of previous brews
interface PreviousBrewData {
  roastedDate: string | number | null;
  timestamp: string | number | null;
  rating?: number | null;
  steepTime?: number | null;
  grindSize?: string | null;
  waterTemp?: string | null;
  useBloom?: boolean | null;
  bloomTime?: string | null;
  notes?: string | null;
  // Add other relevant fields if needed
}

// Export the handler function with typed req and res
module.exports = async (req: VercelRequest, res: VercelResponse) => {
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

  // Get OpenAI API key from environment
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
  }

  try {
    const requestBody = req.body || {};
    // Destructure with explicit types where possible (or keep as is if structure varies)
    const { currentBrew, previousBrews, selectedBeanName, currentGrinderName, beanName, brewMethod, roastLevel, flavorNotes, roastedDate, country, process, userComment } = requestBody;
    
    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    let prompt = "";

    // Determine which type of suggestion to generate based on inputs
    if (currentBrew) {
      // --- Build Historical Suggestion Prompt ---
      console.log('Building historical suggestion prompt');
      const currentBeanName = currentBrew.beanName || selectedBeanName || 'this coffee';
      const currentBrewAge = calculateAgeDays(currentBrew.roastedDate, currentBrew.timestamp);

      prompt = `As a coffee expert, I'm analyzing a brew of ${currentBeanName}. Here are the details:

Current Brew:
- Steep Time: ${formatTime(currentBrew.steepTime)}
- Grind Size: ${currentBrew.grindSize}
- Water Temperature: ${currentBrew.waterTemp}
${currentBrew.useBloom ? `- Bloom: Yes (${currentBrew.bloomTime || 'unspecified time'})` : '- Bloom: No'}
${currentBrew.brewDevice ? `- Brewing Device: ${currentBrew.brewDevice}` : ''}
${currentBrew.grinder ? `- Grinder: ${currentBrew.grinder}` : ''} ${currentGrinderName ? `(${currentGrinderName})` : '' }
${currentBrew.notes ? `- Notes: ${currentBrew.notes}` : ''}
${currentBrew.rating ? `- Rating: ${currentBrew.rating}/10` : ''}
${currentBrew.roastedDate ? `- Roasted Date: ${new Date(currentBrew.roastedDate).toLocaleDateString()}` : ''}
${currentBrewAge !== null ? `- Age When Brewed: ${currentBrewAge} days` : ''}
`;

      if (previousBrews && Array.isArray(previousBrews) && previousBrews.length > 0) {
        prompt += `\nRelevant previous brews of the same bean (sorted by rating):\n`;
        // Type the parameters in forEach
        previousBrews.forEach((brew: PreviousBrewData, index: number) => {
          const prevBrewAge = calculateAgeDays(brew.roastedDate, brew.timestamp);
          // Add checks for optional properties before accessing
          prompt += `\nBrew #${index + 1} (Rating: ${brew.rating ?? 'N/A'}/10):
- Steep Time: ${brew.steepTime ? formatTime(brew.steepTime) : 'N/A'}
- Grind Size: ${brew.grindSize ?? 'N/A'}
- Water Temperature: ${brew.waterTemp ?? 'N/A'}
${brew.useBloom ? `- Bloom: Yes (${brew.bloomTime || 'unspecified time'})` : '- Bloom: No'}
${brew.notes ? `- Notes: ${brew.notes}` : ''}
${prevBrewAge !== null ? `- Age When Brewed: ${prevBrewAge} days` : ''}
`;
        });
      }

      if (userComment && userComment.trim()) {
        prompt += `\nUser's Request/Comment: ${userComment.trim()}\nPlease take this comment into consideration.
`;
      }

      prompt += `
Based on the current brew and any previous brews of the same bean, please provide concise suggestions to improve the brewing process. Consider these factors:
1. Grind size adjustments
2. Steep time modifications
3. Water temperature changes
4. Bloom technique
5. Any other techniques that might enhance the flavor

Please provide specific, actionable advice that would help achieve a better extraction and flavor profile.

If previous brews with the same grinder (${currentGrinderName || 'used previously'}) exist and used specific click settings (e.g., "18, 22, 24"), base your grind size suggestion on those clicks (e.g., suggest "17, 21, 23 clicks"). 
`;

    } else if (brewMethod) {
      // --- Build Generic Suggestion Prompt ---
      console.log('Building generic suggestion prompt');
      const effectiveBeanName = beanName || selectedBeanName || 'this coffee'; // Use provided name or fallback
      const effectiveRoastLevel = roastLevel || 'Unknown';
      const effectiveFlavorNotes = Array.isArray(flavorNotes) ? flavorNotes.join(', ') : 'Unknown';
      const effectiveCountry = country || 'Unknown';
      const effectiveProcess = process || 'Unknown';
      const beanAge = roastedDate ? calculateAgeDays(roastedDate, Date.now()) : null;

      prompt = `Please suggest optimal starting brewing parameters for the following coffee:

Bean Name: ${effectiveBeanName}
Origin: ${effectiveCountry}
Process: ${effectiveProcess}
Roast Level: ${effectiveRoastLevel}
Flavor Notes: ${effectiveFlavorNotes}
Bean Age (days since roast): ${beanAge !== null ? beanAge : 'Unknown'}
Brew Method: ${brewMethod}
${currentGrinderName ? `Grinder: ${currentGrinderName}
` : ''}
`;

      if (userComment && userComment.trim()) {
        prompt += `User's Request/Comment: ${userComment.trim()}\nPlease take this comment into consideration when suggesting parameters.
`;
      }

      prompt += `Provide brew parameters optimized for this specific coffee's characteristics as a starting point.
`;

    } else {
      return res.status(400).json({ 
        error: 'Missing required parameters. Provide either currentBrew details (for history-based) or bean details and brewMethod (for generic).' 
      });
    }

    // --- Add common JSON output instructions to the prompt ---
    prompt += `
Return the response ONLY as a valid JSON object with the exact structure below. Do NOT include any explanatory text, greetings, apologies, or markdown formatting (like \`\`\`) before or after the JSON object.

{
  "suggestionText": "<Your detailed textual suggestions here (or explanation for generic)>",
  "suggestedGrindSize": "<Suggested grind size in clicks in context to the grinder and history (e.g., '18', '25', '26').",
  "suggestedWaterTemp": "<Suggested water temperature in degrees Celsius ('96°C'), or null>",
  "suggestedSteepTimeSeconds": "<Suggested steep time in total seconds, e.g., 180, or null>",
  "suggestedUseBloom": "<true if bloom is recommended, false otherwise>",
  "suggestedBloomTimeSeconds": "<Bloom time in seconds, e.g., 30, or null if bloom is not recommended or time is unspecified>"
}`; 

    // --- Call OpenAI API --- 
    console.log('Sending prompt to OpenAI...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-2025-04-14', // Using gpt-4o for all suggestions
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7, // Keep slight creativity for suggestions
      max_tokens: 500,
      // response_format: { type: "json_object" }, // Consider enabling if model reliably supports it
    });

    const messageContent = response.choices[0]?.message?.content;

    if (!messageContent) {
      return res.status(500).json({ error: 'No message content received from OpenAI API' });
    }

    // --- Parse and Format Response --- 
    console.log('Received response from OpenAI. Parsing...');
    const jsonResponse = extractJson(messageContent);

    if (jsonResponse) {
      // Add formatted times for convenience
      if (typeof jsonResponse.suggestedSteepTimeSeconds === 'number' || 
          (!isNaN(parseInt(jsonResponse.suggestedSteepTimeSeconds, 10)))) {
        const seconds = typeof jsonResponse.suggestedSteepTimeSeconds === 'number' ? 
          jsonResponse.suggestedSteepTimeSeconds : 
          parseInt(jsonResponse.suggestedSteepTimeSeconds, 10);
        jsonResponse.steepTimeFormatted = formatTime(seconds);
      }
      
      if (typeof jsonResponse.suggestedBloomTimeSeconds === 'number' || 
          (!isNaN(parseInt(jsonResponse.suggestedBloomTimeSeconds, 10)))) {
        const seconds = typeof jsonResponse.suggestedBloomTimeSeconds === 'number' ? 
          jsonResponse.suggestedBloomTimeSeconds : 
          parseInt(jsonResponse.suggestedBloomTimeSeconds, 10);
        jsonResponse.bloomTimeFormatted = formatTime(seconds);
      }
      
      console.log('Successfully parsed response:', jsonResponse);
      return res.status(200).json(jsonResponse);
    } else {
      console.error('Failed to extract/parse OpenAI response:', messageContent);
      return res.status(500).json({ 
        error: 'Failed to parse AI response as JSON',
        rawResponse: messageContent
      });
    }
  } catch (error: any) { // Type the error as any
    console.error('Error processing brew suggestion:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      // Access message safely
      details: error?.message || String(error) 
    });
  }
}; 