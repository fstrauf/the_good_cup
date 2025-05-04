import { verifyAuthToken } from '../auth';
import { getBodyJSON } from '../utils';
import { OpenAI } from 'openai'; // Use import for ES modules
import type { Context } from 'hono';

// Define expected request body structure (optional but good practice)
interface BrewSuggestionRequest {
    beanName: string;
    roastLevel?: string | null;
    flavorNotes?: string[] | null;
    roastedDate?: string | null;
    country?: string | null;
    process?: string | null;
    brewMethod: string;
    userComment?: string | null;
}

// Define the response structure from getOpenAISuggestion if not already exported
// Example:
// export interface BrewSuggestionResponse {
//   suggestionText: string | null;
//   suggestedGrindSize: string | null;
//   // ... other fields
// }

// --- Helper Functions (Keep them here or move to utils) ---

function formatTime(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function calculateAgeDays(roastedTimestamp: string | number | null, brewTimestamp: string | number | null): number | null {
  if (!roastedTimestamp || !brewTimestamp) return null;
  try {
    const roastedDate = new Date(roastedTimestamp);
    const brewDate = new Date(brewTimestamp);
    if (isNaN(roastedDate.getTime()) || isNaN(brewDate.getTime())) return null;
    
    // Normalize to start of day to compare days accurately
    roastedDate.setHours(0, 0, 0, 0);
    brewDate.setHours(0, 0, 0, 0);

    const differenceInTime = brewDate.getTime() - roastedDate.getTime();
    const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
    
    return differenceInDays >= 0 ? differenceInDays : null;
  } catch (e) {
    console.error('[calculateAgeDays] Error:', e);
    return null;
  }
}

function extractJson(content: string | null | undefined): any | null {
  if (!content) return null;
  content = content.trim();
  const codeFenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeFenceMatch && codeFenceMatch[1]) {
    content = codeFenceMatch[1].trim();
  } else {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1).trim();
    } else {
        // If no JSON structure found, return null or handle as plain text?
        console.warn('[extractJson] Could not find JSON structure in content.');
        return null; 
    }
  }
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("[extractJson] Failed to parse JSON:", content, e);
    return null;
  }
}

interface PreviousBrewData { // Keep interface definition
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

// --- POST /api/brew-suggestion ---
export async function handleBrewSuggestion(c: Context) {
    console.log('[brewSuggestionHandler] POST handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    // Get OpenAI API key from environment
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        console.error('[brewSuggestionHandler] Missing OpenAI API key');
        throw { status: 500, message: 'Server configuration error' };
    }

    try {
        const requestBody = await c.req.json();
        const { currentBrew, previousBrews, selectedBeanName, currentGrinderName, beanName, brewMethod, roastLevel, flavorNotes, roastedDate, country, process, userComment } = requestBody;
        
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        let prompt = "";

        // --- Build Prompt Logic (copied from original) ---
        if (currentBrew) {
          console.log('[brewSuggestionHandler] Building historical prompt');
          const currentBeanName = currentBrew.beanName || selectedBeanName || 'this coffee';
          const currentBrewAge = calculateAgeDays(currentBrew.roastedDate, currentBrew.timestamp);
          // ... (rest of historical prompt building) ...
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
           console.log('[brewSuggestionHandler] Building generic prompt');
           const effectiveBeanName = beanName || selectedBeanName || 'this coffee';
           const effectiveRoastLevel = roastLevel || 'Unknown';
           const effectiveFlavorNotes = Array.isArray(flavorNotes) ? flavorNotes.join(', ') : 'Unknown';
           const effectiveCountry = country || 'Unknown';
           const effectiveProcess = process || 'Unknown';
           const beanAge = roastedDate ? calculateAgeDays(roastedDate, Date.now()) : null;
           // ... (rest of generic prompt building) ...
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
            throw { status: 400, message: 'Missing required parameters. Provide either currentBrew details or bean details and brewMethod.' };
        }

        // --- Add JSON output instructions (copied from original) ---
        prompt += `
Return the response ONLY as a valid JSON object with the exact structure below. Do NOT include any explanatory text, greetings, apologies, or markdown formatting (like \`\`\`) before or after the JSON object.

{
  "suggestionText": "<Your detailed textual suggestions here (or explanation for generic)>",
  "suggestedGrindSize": "<Suggested grind size in clicks in context to the grinder and history (e.g., '18', '25', '26').>",
  "suggestedWaterTemp": "<Suggested water temperature in degrees Celsius ('96°C'), or null>",
  "suggestedSteepTimeSeconds": <Suggested steep time in total seconds, e.g., 180, or null>,
  "suggestedUseBloom": <true if bloom is recommended, false otherwise>,
  "suggestedBloomTimeSeconds": <Bloom time in seconds, e.g., 30, or null if bloom is not recommended or time is unspecified>
}`; 

        // --- Call OpenAI API (copied from original) ---
        console.log('[brewSuggestionHandler] Sending prompt to OpenAI...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Using latest recommended model
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.6, // Slightly reduced temperature
            max_tokens: 450, // Slightly reduced tokens
            // response_format: { type: "json_object" }, // Re-enable if reliable
        });

        const messageContent = response.choices[0]?.message?.content;
        if (!messageContent) {
            throw { status: 500, message: 'No message content received from OpenAI API' };
        }

        // --- Parse and Format Response (copied from original) ---
        console.log('[brewSuggestionHandler] Received OpenAI response. Parsing...');
        const jsonResponse = extractJson(messageContent);

        if (!jsonResponse) { // Check if parsing failed
            console.error('[brewSuggestionHandler] Failed to parse JSON from OpenAI response:', messageContent);
             throw { status: 500, message: 'Failed to parse suggestion from AI service.' };
        }
        
        // Add formatted times (optional, frontend can also do this)
        if (jsonResponse.suggestedSteepTimeSeconds !== null && jsonResponse.suggestedSteepTimeSeconds !== undefined) {
            jsonResponse.steepTimeFormatted = formatTime(jsonResponse.suggestedSteepTimeSeconds);
        }
        if (jsonResponse.suggestedBloomTimeSeconds !== null && jsonResponse.suggestedBloomTimeSeconds !== undefined) {
            jsonResponse.bloomTimeFormatted = formatTime(jsonResponse.suggestedBloomTimeSeconds);
        }
        
        console.log('[brewSuggestionHandler] Successfully generated suggestion.');
        return jsonResponse; // Return the final JSON object

    } catch (error: any) {
        console.error('[brewSuggestionHandler] Error:', error);
        // Re-throw structured error for the main router
        throw { status: error.status || 500, message: error.message || 'Failed to get brew suggestion.' };
    }
} 