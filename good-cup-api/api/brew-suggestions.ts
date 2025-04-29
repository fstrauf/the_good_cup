import { OpenAI } from 'openai';
import { verifyAuthToken } from '../lib/auth'; 
import { getBodyJSON } from '../lib/utils';

// --- Helper Functions ---
const formatTime = (totalSeconds: number): string => { /* ... */ 
    if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};
const calculateAgeDays = (roastedTimestamp?: number | string, brewTimestamp?: number | string): number | null => { /* ... */ 
    if (!roastedTimestamp || !brewTimestamp) return null;
    try {
        const roastedDate = new Date(roastedTimestamp);
        const brewDate = new Date(brewTimestamp);
        if (isNaN(roastedDate.getTime()) || isNaN(brewDate.getTime())) return null;
        roastedDate.setHours(0, 0, 0, 0);
        brewDate.setHours(0, 0, 0, 0);
        const differenceInTime = brewDate.getTime() - roastedDate.getTime();
        const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
        return differenceInDays >= 0 ? differenceInDays : null;
    } catch(e) { return null; }
};
function extractJson(content: string | null): any | null { /* ... */ 
    if (!content) return null;
    content = content.trim();
    const codeFenceMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeFenceMatch && codeFenceMatch[1]) { content = codeFenceMatch[1].trim(); }
    else { const genericCodeFenceMatch = content.match(/```\s*([\s\S]*?)\s*```/); if (genericCodeFenceMatch && genericCodeFenceMatch[1]) { content = genericCodeFenceMatch[1].trim(); } else if (content.startsWith('{') && content.endsWith('}')) { } else { const firstBrace = content.indexOf('{'); const lastBrace = content.lastIndexOf('}'); if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) { content = content.substring(firstBrace, lastBrace + 1).trim(); } } }
    try { return JSON.parse(content); } catch (e) { console.error("[brew-suggestions.ts:JSONExtract:Error]", content, e); return null; }
}
// --- End Helper Functions ---

// --- Define Brew interface locally if not imported ---
// Consider moving to a shared types file
interface Brew { 
  beanName: string;
  steepTime: number;
  grindSize: string;
  waterTemp: number;
  useBloom: boolean;
  bloomTime?: number | string; // Allow string from older data?
  brewDevice?: string;
  grinder?: string;
  notes?: string;
  rating?: number;
  roastedDate?: number | string; // Allow string?
  timestamp: number | string;
}

export default async (req: any, res: any) => {
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

    const authResult = await verifyAuthToken(req);
    if (!authResult.userId) {
        return res.status(authResult.status || 401).json({ message: authResult.error });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
    }

    console.log('[brew-suggestions.ts] POST handler invoked');
    try {
        const {
            currentBrew, previousBrews, selectedBeanName, currentGrinderName, userComment 
        } = await getBodyJSON(req);
        
        if (!currentBrew) {
            return res.status(400).json({ error: 'Missing required parameter: currentBrew' });
        }

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        const currentBrewAge = calculateAgeDays(currentBrew.roastedDate, currentBrew.timestamp);

        // Build Prompt (adapted from index.ts)
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

        if (previousBrews && previousBrews.length > 0) {
          prompt += `\nRelevant previous brews of the same bean (sorted by rating):\n`;
          previousBrews.forEach((brew: Brew, index: number) => {
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

        if (userComment) {
          prompt += `\nUser Comment/Request: ${userComment}\n`;
        }

        prompt += `\nBased on the current brew, previous brews, and user comment (if any), ...`; // Keep rest of prompt including JSON structure
        prompt += `
Return the response ONLY as a valid JSON object with the exact structure below. Do NOT include any explanatory text, greetings, apologies, or markdown formatting (like \`\`\`) before or after the JSON object.

{
  "suggestionText": "<Your detailed textual suggestions here>",
  "suggestedGrindSize": "<Specific suggested grind size in clicks, e.g., '17, 25, 35', or null if no specific suggestion>",
  "suggestedWaterTemp": "<Specific water temperature, e.g., '96°C', or null>",
  "suggestedSteepTimeSeconds": <Steep time in total seconds, e.g., 180, or null>,
  "suggestedUseBloom": <boolean, true if bloom is recommended, false otherwise>,
  "suggestedBloomTimeSeconds": <Bloom time in seconds, e.g., 30, or null if bloom is not recommended or time is unspecified>
}`;        

        console.log('[brew-suggestions.ts] Sending prompt to OpenAI...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 500
        });

        const messageContent = response.choices[0]?.message?.content;
        if (!messageContent) {
            return res.status(500).json({ error: 'No message content received from OpenAI API' });
        }

        const jsonResponse = extractJson(messageContent);
        if (jsonResponse) {
           return res.status(200).json(jsonResponse);
        } else {
            console.error('[brew-suggestions.ts:Error] Failed to parse OpenAI response:', messageContent);
            return res.status(500).json({ error: 'Failed to parse AI response as JSON', rawResponse: messageContent });
        }

    } catch (error) {
        console.error('[brew-suggestions.ts:Error]', error);
         if (error instanceof Error && error.message.includes('Invalid JSON')) {
             return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Internal Server Error generating brew suggestions from history' });
    }
}; 