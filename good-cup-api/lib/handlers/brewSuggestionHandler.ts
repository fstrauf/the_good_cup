import { OpenAI } from 'openai';
import { verifyAuthToken } from '../auth'; // Use correct auth import
import type { Context } from 'hono'; // Import Hono Context

// --- Helper Functions (Keep as is) ---
function formatTime(totalSeconds: number) {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

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

// --- Interfaces (Keep as is) ---
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
}

// Expected request body structure (can be refined based on actual usage)
interface BrewSuggestionRequest {
  currentBrew?: any; // Define more specific type if possible
  previousBrews?: PreviousBrewData[];
  selectedBeanName?: string;
  currentGrinderName?: string;
  beanName?: string;
  brewMethod?: string;
  roastLevel?: string;
  flavorNotes?: string[];
  roastedDate?: string | number | null;
  country?: string;
  process?: string;
  userComment?: string;
}

// Expected successful response structure
interface BrewSuggestionResponse {
  suggestionText: string | null;
  suggestedGrindSize: string | null;
  suggestedWaterTemp: string | null;
  suggestedSteepTimeSeconds: number | null;
  suggestedUseBloom: boolean | null;
  suggestedBloomTimeSeconds: number | null;
  steepTimeFormatted?: string; // Added by handler
  bloomTimeFormatted?: string; // Added by handler
}

// --- Hono Handler Function ---
export async function handleBrewSuggestion(c: Context): Promise<Response> {
  console.log('[handleBrewSuggestion] Function invoked');

  // --- Authentication ---
  const authResult = await verifyAuthToken(c.req);
  if (!authResult.userId) {
      console.warn('[handleBrewSuggestion] Authentication failed:', authResult.error);
      throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };
  }
  console.log(`[handleBrewSuggestion] Authenticated user: ${authResult.userId}`);
  // const userId = authResult.userId;

  // --- Get OpenAI API Key ---
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
      console.error("[handleBrewSuggestion] Missing OpenAI API key");
      throw { status: 500, message: 'Server configuration error: Missing OpenAI API key' };
  }

  try {
    // --- Parse Request Body ---
    const requestBody: BrewSuggestionRequest = await c.req.json();
    const { currentBrew, previousBrews, selectedBeanName, currentGrinderName, beanName, brewMethod, roastLevel, flavorNotes, roastedDate, country, process, userComment } = requestBody;
    
    // --- Initialize OpenAI and Prompt Logic (Keep as is) ---
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    let prompt = "";

    if (currentBrew) {
      // --- Build Historical Suggestion Prompt (Keep existing logic) ---
      console.log('[handleBrewSuggestion] Building historical suggestion prompt');
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
        previousBrews.forEach((brew: PreviousBrewData, index: number) => {
          const prevBrewAge = calculateAgeDays(brew.roastedDate, brew.timestamp);
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
      // --- Build Generic Suggestion Prompt (Keep existing logic) ---
      console.log('[handleBrewSuggestion] Building generic suggestion prompt');
      const effectiveBeanName = beanName || selectedBeanName || 'this coffee';
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
      // Use Hono error throwing
      console.warn('[handleBrewSuggestion] Bad Request: Missing required parameters');
      throw { 
        status: 400, 
        message: 'Missing required parameters. Provide either currentBrew details (for history-based) or bean details and brewMethod (for generic).' 
      };
    }

    // --- Add common JSON output instructions (Keep existing logic) ---
    prompt += `
Return the response ONLY as a valid JSON object with the exact structure below. Do NOT include any explanatory text, greetings, apologies, or markdown formatting (like \`\`\`) before or after the JSON object.

{
  "suggestionText": "<Your detailed textual suggestions here (or explanation for generic)>",
  "suggestedGrindSize": "<Suggested grind size in clicks in context to the grinder and history (e.g., '18', '25', '26').>",
  "suggestedWaterTemp": "<Suggested water temperature in degrees Celsius ('96°C'), or null>",
  "suggestedSteepTimeSeconds": "<Suggested steep time in total seconds, e.g., 180, or null>",
  "suggestedUseBloom": "<true if bloom is recommended, false otherwise>",
  "suggestedBloomTimeSeconds": "<Bloom time in seconds, e.g., 30, or null if bloom is not recommended or time is unspecified>"
}`; 

    // --- Call OpenAI API (Keep existing logic) ---
    console.log('[handleBrewSuggestion] Sending prompt to OpenAI...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-2025-04-14',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    });

    const messageContent = response.choices[0]?.message?.content;

    if (!messageContent) {
      console.error('[handleBrewSuggestion] No message content received from OpenAI API');
      throw { status: 500, message: 'No message content received from OpenAI API' };
    }

    // --- Parse and Format Response (Keep existing logic) ---
    console.log('[handleBrewSuggestion] Received response from OpenAI. Parsing...');
    const jsonResponse: BrewSuggestionResponse | null = extractJson(messageContent);

    if (jsonResponse) {
      // Add formatted times
      if (typeof jsonResponse.suggestedSteepTimeSeconds === 'number' || 
          (!isNaN(parseInt(String(jsonResponse.suggestedSteepTimeSeconds), 10)))) {
        const seconds = typeof jsonResponse.suggestedSteepTimeSeconds === 'number' ? 
          jsonResponse.suggestedSteepTimeSeconds : 
          parseInt(String(jsonResponse.suggestedSteepTimeSeconds), 10);
        jsonResponse.steepTimeFormatted = formatTime(seconds);
      }
      
      if (typeof jsonResponse.suggestedBloomTimeSeconds === 'number' || 
          (!isNaN(parseInt(String(jsonResponse.suggestedBloomTimeSeconds), 10)))) {
        const seconds = typeof jsonResponse.suggestedBloomTimeSeconds === 'number' ? 
          jsonResponse.suggestedBloomTimeSeconds : 
          parseInt(String(jsonResponse.suggestedBloomTimeSeconds), 10);
        jsonResponse.bloomTimeFormatted = formatTime(seconds);
      }
      
      console.log('[handleBrewSuggestion] Successfully parsed response.');
      // Return Hono response
      return c.json(jsonResponse, 200);
    } else {
      console.error('[handleBrewSuggestion] Failed to extract/parse OpenAI response:', messageContent);
      // Throw Hono error
      throw { 
        status: 500, 
        message: 'Failed to parse AI response as JSON', 
        rawResponse: messageContent
      };
    }
  } catch (error: any) {
    console.error('[handleBrewSuggestion] Error during processing:', error);
    // Re-throw structured error for Hono
    const status = typeof error.status === 'number' ? error.status : 500;
    const message = error.message || 'Internal Server Error';
    const details = error.rawResponse || (process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : String(error)) : undefined);

    throw { status, message, details };
  }
}