import AsyncStorage from '@react-native-async-storage/async-storage';
import OpenAI from 'openai';

// Interfaces
export interface Brew {
  id: string;
  timestamp: number;
  beanName: string;
  steepTime: number; // Seconds
  useBloom: boolean;
  bloomTime?: string;
  grindSize: string;
  waterTemp: string;
  rating: number;
  notes: string;
  brewDevice?: string;
  grinder?: string;
}

// Interface for the structured JSON response from suggestion API calls
export interface BrewSuggestionResponse {
  suggestionText: string;
  suggestedGrindSize: string | null;
  suggestedWaterTemp: string | null; // e.g., "96°C"
  suggestedSteepTimeSeconds: number | null; // e.g., 180
  suggestedUseBloom: boolean;
  suggestedBloomTimeSeconds: number | null; // e.g., 30
}

export interface BrewDevice {
  id: string;
  name: string;
}

export interface Grinder {
  id: string;
  name: string;
}

// Storage keys
const API_KEY_STORAGE_KEY = '@GoodCup:openaiApiKey';
const BREW_DEVICES_STORAGE_KEY = '@GoodCup:brewDevices';
const GRINDERS_STORAGE_KEY = '@GoodCup:grinders';

// Helper function to get API key (checks env vars first, then storage)
const getApiKeyInternal = async (): Promise<string | null> => {
  try {
    // First check process.env for Expo public env var
    const expoApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    if (expoApiKey && expoApiKey.trim() !== '' && expoApiKey !== 'your_openai_api_key_here') {
      console.log('Using API key from environment variable');
      return expoApiKey;
    }

    // If no env variable, check AsyncStorage
    console.log('No environment API key found or invalid, checking AsyncStorage');
    const apiKey = await AsyncStorage.getItem(API_KEY_STORAGE_KEY);
    if (apiKey && apiKey.trim() !== '') {
      console.log('Using API key from AsyncStorage');
      return apiKey;
    }

    console.log('No valid API key found in environment or AsyncStorage');
    return null;
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
};

// Save API key to AsyncStorage
export const saveApiKey = async (apiKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    // No client reset needed anymore
  } catch (error) {
    console.error('Error saving API key:', error);
    throw new Error('Failed to save API key');
  }
};

// Get API key (exported for use in settings or elsewhere)
export const getApiKey = async (): Promise<string | null> => {
  return await getApiKeyInternal();
};

// Helper function to format time
const formatTime = (totalSeconds: number): string => {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// Add this helper function near the top
const extractJson = (content: string | null): any | null => {
  if (!content) return null;

  // 1. Check for markdown code fence
  const codeFenceMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeFenceMatch && codeFenceMatch[1]) {
    content = codeFenceMatch[1].trim();
  } else {
    // 2. If no code fence, look for the first '{' and last '}'
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1).trim();
    } else {
      // 3. If still no structure, assume it might be the raw JSON (or invalid)
      content = content.trim();
    }
  }

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse extracted JSON content:", content, e);
    return null; // Return null if parsing fails after extraction attempts
  }
};

// Simplified API call function with stateless client initialization
export async function makeOpenAICall<T>(callFunction: (client: OpenAI) => Promise<T>): Promise<T> {
  try {
    // 1. Get the API key
    console.log('[makeOpenAICall] Getting API key...');
    const apiKey = await getApiKeyInternal();
    console.log(`[makeOpenAICall] API key found: ${!!apiKey}`);
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please set it in the settings.');
    }

    // 2. Initialize a new client for this call
    let client: OpenAI;
    try {
      console.log('[makeOpenAICall] Initializing OpenAI client instance...');
      // --- BEGIN DEBUG LOG --- 
      // Log parts of the key to verify it's loaded, but avoid logging the full key if possible
      const keyExists = !!apiKey;
      const keyPreview = keyExists ? `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 4)}` : 'null';
      console.log(`[makeOpenAICall] Attempting to initialize client with API Key (Exists: ${keyExists}, Preview: ${keyPreview})`);
      // --- END DEBUG LOG ---
      client = new OpenAI({
        apiKey: apiKey, // Ensure apiKey is the variable holding the retrieved key
        dangerouslyAllowBrowser: true,
        timeout: 15000, // Increased timeout slightly to 15s
      });
      console.log('[makeOpenAICall] OpenAI client instance initialized successfully.');
    } catch (initError) {
      console.error('Error initializing OpenAI client instance:', initError);
      throw new Error('Failed to initialize OpenAI client.');
    }

    // 3. Execute the provided call function
    console.log('[makeOpenAICall] Executing provided call function...');
    const result = await callFunction(client);
    console.log('[makeOpenAICall] Call function executed successfully.');
    return result;

  } catch (error) {
    // Log the error and re-throw it for the caller to handle
    console.error('[makeOpenAICall] Error during execution:', error);
    // No client reset needed as the client is stateless per call
    throw error; // Re-throw the original error (or a more specific one if needed)
  }
}

// Get brew suggestions from OpenAI API
export const getBrewSuggestions = async (
  currentBrew: Brew,
  previousBrews: Brew[],
  selectedBeanName?: string,
  currentGrinderName?: string
): Promise<BrewSuggestionResponse> => {
  try {
    // Get brew devices and grinders
    const storedDevices = await AsyncStorage.getItem(BREW_DEVICES_STORAGE_KEY);
    const storedGrinders = await AsyncStorage.getItem(GRINDERS_STORAGE_KEY);
    
    const brewDevices: BrewDevice[] = storedDevices ? JSON.parse(storedDevices) : [];
    const grinders: Grinder[] = storedGrinders ? JSON.parse(storedGrinders) : [];
    
    // Find current brew device and grinder names
    const brewDeviceName = currentBrew.brewDevice 
      ? brewDevices.find(device => device.id === currentBrew.brewDevice)?.name || 'Unknown'
      : undefined;
      
    const grinderName = currentBrew.grinder
      ? grinders.find(grinder => grinder.id === currentBrew.grinder)?.name || 'Unknown'
      : undefined;
    
    // Determine possible devices and grinders from notes if not specified
    let possibleDevices: string[] = [];
    let possibleGrinders: string[] = [];
    
    if (!brewDeviceName && currentBrew.notes) {
      possibleDevices = brewDevices
        .filter(device => currentBrew.notes.toLowerCase().includes(device.name.toLowerCase()))
        .map(device => device.name);
    }
    
    if (!grinderName && currentBrew.notes) {
      possibleGrinders = grinders
        .filter(grinder => currentBrew.notes.toLowerCase().includes(grinder.name.toLowerCase()))
        .map(grinder => grinder.name);
    }

    // Filter and sort previous brews
    const relevantBrews = previousBrews
      .filter(brew => {
        if (selectedBeanName) {
          return brew.beanName.toLowerCase() === selectedBeanName.toLowerCase();
        }
        return true;
      })
      .sort((a, b) => b.rating - a.rating) // Sort by rating, highest first
      .slice(0, 5); // Take top 5 rated

    // Construct prompt
    let prompt = `As a coffee expert, I'm analyzing a brew of ${currentBrew.beanName}. Here are the details:

Current Brew:
- Steep Time: ${formatTime(currentBrew.steepTime)}
- Grind Size: ${currentBrew.grindSize}
- Water Temperature: ${currentBrew.waterTemp}
${currentBrew.useBloom ? `- Bloom: Yes (${currentBrew.bloomTime || 'unspecified time'})` : '- Bloom: No'}
${brewDeviceName ? `- Brewing Device: ${brewDeviceName}` : ''}
${grinderName ? `- Grinder: ${grinderName}` : ''}
${currentBrew.notes ? `- Notes: ${currentBrew.notes}` : ''}
${currentBrew.rating ? `- Rating: ${currentBrew.rating}/10` : ''}

${possibleDevices.length > 0 ? `Possibly using these brew devices: ${possibleDevices.join(', ')}` : ''}
${possibleGrinders.length > 0 ? `Possibly using these grinders: ${possibleGrinders.join(', ')}` : ''}
`;

    // Add information about previous brews if available
    if (relevantBrews.length > 0) {
      prompt += `\nRelevant previous brews of the same bean (sorted by rating):\n`;
      
      relevantBrews.forEach((brew, index) => {
        prompt += `\nBrew #${index + 1} (Rating: ${brew.rating}/10):
- Steep Time: ${formatTime(brew.steepTime)}
- Grind Size: ${brew.grindSize}
- Water Temperature: ${brew.waterTemp}
${brew.useBloom ? `- Bloom: Yes (${brew.bloomTime || 'unspecified time'})` : '- Bloom: No'}
${brew.notes ? `- Notes: ${brew.notes}` : ''}
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

    console.log('Attempting OpenAI API call for brew suggestions...');

    // Use the simplified API call function
    const response = await makeOpenAICall(async (client) => {
      return await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      });
    });

    console.log('Successfully received response from OpenAI');
    const messageContent = response.choices[0]?.message?.content;
    
    if (!messageContent) {
      console.error('No message content received from OpenAI API.');
      throw new Error('Failed to get valid response from OpenAI API.');
    }

    console.log('Raw OpenAI response content:', messageContent);

    // Replace the try-catch block for parsing
    const parsedResponse = extractJson(messageContent); // Use the helper

    if (parsedResponse) {
      console.log('Parsed suggestion response:', parsedResponse);
      // Basic type checking (can be more robust)
      if (typeof parsedResponse.suggestionText === 'string') {
        return parsedResponse as BrewSuggestionResponse;
      } else {
         console.error('Parsed JSON is missing required fields or has wrong types.');
         throw new Error('Received invalid data structure from OpenAI.');
      }
    } else {
      // Fallback logic is less reliable, throw error directly
      console.error('Failed to extract valid JSON from OpenAI response.');
      throw new Error('Failed to parse or extract suggestion from OpenAI response.');
    }
  } catch (error) {
    console.error('Error fetching brew suggestions:', error);
    // Re-throw the error for the calling function to handle UI updates
    throw error;
  }
};

// Analyze image with vision model
export const analyzeImage = async (base64Image: string): Promise<any> => {
  try {
    console.log('Attempting OpenAI API call for image analysis...');

    // Use the simplified API call function
    const response = await makeOpenAICall(async (client) => {
      return await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'This is a photo of a coffee bean package. Please extract and provide the following information in JSON format:\n' +
                      '1. Bean name\n' +
                      '2. Roast level (Use only one of these specific values: Light, Medium-Light, Medium, Medium-Dark, Dark. Infer this from the description/label if possible.)\n' +
                      '3. Flavor notes (as an array of strings)\n' +
                      '4. Description\n\n' +
                      'If you cannot determine a field, use "Unknown" or an empty array for flavor notes. Return ONLY valid JSON with these fields.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64Image
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      });
    });
    
    console.log('Successfully received image analysis response from OpenAI');
    
    const messageContent = response.choices[0]?.message?.content;
    
    if (messageContent) {
      // Extract JSON from the response (handling potential text before or after JSON)
      const jsonMatch = messageContent.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : messageContent; // Attempt to find JSON block
      try {
        return JSON.parse(jsonString); // Parse the extracted JSON
      } catch (parseError) {
         console.error('Failed to parse JSON from OpenAI response:', jsonString, parseError);
         throw new Error('Failed to parse image analysis data.');
      }
    }
    
    throw new Error('No content returned from OpenAI');
  } catch (error) {
    console.error('Error analyzing image:', error);
    // Let the caller handle the error
    throw error;
  }
};

// Function to generate generic brew suggestion based on bean characteristics
export const generateGenericBrewSuggestion = async (
  bean: { 
    name: string;
    roastLevel: string;
    flavorNotes: string[];
    description: string;
  }
): Promise<BrewSuggestionResponse> => {
  try {
    console.log('Generating generic brew suggestion based on bean characteristics...');
    
    const prompt = `I have a coffee bean called "${bean.name}" with no brewing history yet. 
Roast Level: ${bean.roastLevel}
Flavor Notes: ${bean.flavorNotes.join(', ') || 'Not specified'}
Description: ${bean.description || 'Not available'}

Please provide a comprehensive brewing guide for this bean, including:
1. The optimal brewing parameters specifically for this bean type and roast level
2. How this roast level affects the extraction and what to consider
3. What brewing method would best highlight the flavor notes
4. Specific recommendations for:
   - Grind size
   - Water temperature
   - Steep time
   - Whether to use a bloom phase and for how long
5. A concise approach to adjust parameters if the brew is under or over-extracted

Respond with specific, actionable brewing advice to get the best flavor from this bean.

Return the response ONLY as a valid JSON object with the exact structure below. Do NOT include any explanatory text, greetings, apologies, or markdown formatting (like \`\`\`) before or after the JSON object.

{
  "suggestionText": "<Your detailed textual brewing guide here>",
  "suggestedGrindSize": "<Specific suggested grind size, e.g., 'Medium-Fine', or null>",
  "suggestedWaterTemp": "<Specific water temperature, e.g., '96°C', or null>",
  "suggestedSteepTimeSeconds": <Steep time in total seconds, e.g., 180, or null>,
  "suggestedUseBloom": <boolean, true if bloom is recommended, false otherwise>,
  "suggestedBloomTimeSeconds": <Bloom time in seconds, e.g., 30, or null>
}`;

    console.log('Attempting OpenAI API call for generic brew suggestions...');

    // Use the simplified API call function
    const response = await makeOpenAICall(async (client) => {
      return await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      });
    });

    const messageContent = response.choices[0]?.message?.content;

    if (!messageContent) {
      console.error('No message content received from OpenAI API for generic suggestion.');
      throw new Error('Failed to get valid response from OpenAI API.');
    }

     console.log('Raw OpenAI response content (generic):', messageContent);

    // Replace the try-catch block for parsing
    const parsedResponse = extractJson(messageContent); // Use the helper

    if (parsedResponse) {
       console.log('Parsed generic suggestion response:', parsedResponse);
      // Basic type checking (can be more robust)
       if (typeof parsedResponse.suggestionText === 'string') {
         return parsedResponse as BrewSuggestionResponse;
       } else {
          console.error('Parsed generic JSON is missing required fields or has wrong types.');
          throw new Error('Received invalid data structure from OpenAI (generic).');
       }
    } else {
       console.error('Failed to extract valid JSON from OpenAI response (generic).');
       throw new Error('Failed to parse or extract suggestion from OpenAI response (generic).');
    }

  } catch (error) {
    console.error('Error fetching generic brew suggestions:', error);
    // Re-throw the error
    throw error;
  }
}; 