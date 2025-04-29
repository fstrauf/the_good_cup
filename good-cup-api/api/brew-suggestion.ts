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
    try { return JSON.parse(content); } catch (e) { console.error("[brew-suggestion.ts:JSONExtract:Error]", content, e); return null; }
}
// --- End Helper Functions ---

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

    console.log('[brew-suggestion.ts] POST handler invoked');
    try {
        const {
          beanName, country, process, roastLevel, 
          flavorNotes, brewMethod, roastedDate, userComment
        } = await getBodyJSON(req);
        
        if (!beanName || !brewMethod) {
            return res.status(400).json({ error: 'Missing required parameters: beanName and brewMethod' });
        }

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        const beanAge = roastedDate ? calculateAgeDays(roastedDate, Date.now()) : null;

        // Build Prompt (adapted from index.ts)
        let prompt = `Please suggest optimal brewing parameters for the following coffee:

Bean Name: ${beanName}
Origin: ${country || 'Unknown'}
Process: ${process || 'Unknown'}
Roast Level: ${roastLevel || 'Unknown'}
Flavor Notes: ${flavorNotes ? flavorNotes.join(', ') : 'Unknown'}
Bean Age (days since roast): ${beanAge !== null ? beanAge : 'Unknown'}
Brew Method: ${brewMethod}
`;
        
        if (userComment) {
          prompt += `\nUser Comment/Request: ${userComment}\n`;
        }

        prompt += `
Provide brew parameters optimized for this specific coffee's characteristics and user comment (if any). 
Return ONLY a JSON object ...`; // Keep rest of prompt including JSON structure
         prompt += `
Return ONLY a JSON object with the following structure without any text outside the JSON:
{
  "suggestionText": "A brief explanation of why these parameters would work well with this coffee (2-3 sentences)",
  "suggestedGrindSize": "Suggested grind size (e.g. Fine, Medium-Fine, Medium, Medium-Coarse, Coarse)",
  "suggestedWaterTemp": 93,
  "suggestedSteepTimeSeconds": 150,
  "suggestedUseBloom": true,
  "suggestedBloomTimeSeconds": 30
}

Note that suggestedWaterTemp is in Celsius, suggestedSteepTimeSeconds and suggestedBloomTimeSeconds are in seconds. suggestedUseBloom is a boolean.`;

        console.log('[brew-suggestion.ts] Sending prompt to OpenAI...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
        });

        const messageContent = response.choices[0]?.message?.content;
        if (!messageContent) {
            return res.status(500).json({ error: 'No message content received from OpenAI API' });
        }

        const jsonResponse = extractJson(messageContent);
        if (jsonResponse) {
           if (typeof jsonResponse.suggestedSteepTimeSeconds === 'number') {
             jsonResponse.steepTimeFormatted = formatTime(jsonResponse.suggestedSteepTimeSeconds);
           }
           if (typeof jsonResponse.suggestedBloomTimeSeconds === 'number') {
             jsonResponse.bloomTimeFormatted = formatTime(jsonResponse.suggestedBloomTimeSeconds);
           }
            return res.status(200).json(jsonResponse);
        } else {
            console.error('[brew-suggestion.ts:Error] Failed to parse OpenAI response:', messageContent);
            return res.status(500).json({ error: 'Failed to parse AI response as JSON', rawResponse: messageContent });
        }

    } catch (error) {
        console.error('[brew-suggestion.ts:Error]', error);
         if (error instanceof Error && error.message.includes('Invalid JSON')) {
             return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Internal Server Error generating generic brew suggestion' });
    }
}; 