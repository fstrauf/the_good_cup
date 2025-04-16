// Unified brew suggestions handler for Vercel serverless function
const { OpenAI } = require('openai');

// Format time helper function
function formatTime(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Helper function to calculate age in days
function calculateAgeDays(roastedTimestamp, brewTimestamp) {
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
function extractJson(content) {
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

// Generate historical brew suggestion based on previous brews
async function generateHistoricalSuggestion(openai, currentBrew, previousBrews, selectedBeanName, currentGrinderName) {
  const currentBrewAge = calculateAgeDays(currentBrew.roastedDate, currentBrew.timestamp);

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
    previousBrews.forEach((brew, index) => {
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

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 500
  });

  return response.choices[0]?.message?.content;
}

// Generate generic brew suggestion based on bean characteristics
async function generateGenericSuggestion(openai, bean) {
  // Prepare data for prompt
  const beanName = bean.beanName || bean.name;
  const brewMethod = bean.brewMethod;
  const country = bean.country || 'Unknown';
  const process = bean.process || 'Unknown';
  const roastLevel = bean.roastLevel || 'Unknown';
  const flavorNotes = Array.isArray(bean.flavorNotes) ? bean.flavorNotes.join(', ') : 'Unknown';
  
  // Calculate bean age if roasted date is provided
  const beanAge = bean.roastedDate ? calculateAgeDays(bean.roastedDate, Date.now()) : null;

  const prompt = `Please suggest optimal brewing parameters for the following coffee:

Bean Name: ${beanName}
Origin: ${country}
Process: ${process}
Roast Level: ${roastLevel}
Flavor Notes: ${flavorNotes}
Bean Age (days since roast): ${beanAge !== null ? beanAge : 'Unknown'}
Brew Method: ${brewMethod}

Provide brew parameters optimized for this specific coffee's characteristics. 
Return ONLY a JSON object with the following structure without any text outside the JSON:
{
  "suggestionText": "A brief explanation of why these parameters would work well with this coffee (2-3 sentences)",
  "suggestedGrindSize": "Suggested grind size in clicks of the grinder (e.g. 10, 15, 20, 25, 30)",
  "suggestedWaterTemp": "Suggested water temperature in Celsius (e.g. 93, 95, 97, 100)",
  "suggestedSteepTimeSeconds": "Suggested steep time in seconds (e.g. 150, 180, 210, 240)",
  "suggestedUseBloom": true,
  "suggestedBloomTimeSeconds": 30
}

Note that suggestedWaterTemp is in Celsius, suggestedSteepTimeSeconds and suggestedBloomTimeSeconds are in seconds. suggestedUseBloom is a boolean.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content;
}

// Export the handler function
module.exports = async (req, res) => {
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
    const { currentBrew, previousBrews, selectedBeanName, currentGrinderName, beanName, brewMethod } = requestBody;
    
    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    let messageContent;

    // Determine which type of suggestion to generate (historical or generic)
    if (currentBrew) {
      // Generate historical suggestion based on brew history
      console.log('Generating historical suggestion based on brew history');
      messageContent = await generateHistoricalSuggestion(
        openai, 
        currentBrew, 
        previousBrews || [], 
        selectedBeanName, 
        currentGrinderName
      );
    } else if (brewMethod) {
      // Generate generic suggestion based on bean characteristics
      console.log('Generating generic suggestion based on bean characteristics');
      messageContent = await generateGenericSuggestion(
        openai,
        requestBody
      );
    } else {
      return res.status(400).json({ 
        error: 'Missing required parameters. Either provide currentBrew for historical suggestions or brewMethod for generic suggestions.' 
      });
    }

    if (!messageContent) {
      return res.status(500).json({ error: 'No message content received from OpenAI API' });
    }

    // Parse JSON from OpenAI response
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
      
      return res.status(200).json(jsonResponse);
    } else {
      console.error('Failed to extract/parse OpenAI response:', messageContent);
      return res.status(500).json({ 
        error: 'Failed to parse AI response as JSON',
        rawResponse: messageContent
      });
    }
  } catch (error) {
    console.error('Error processing brew suggestion:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message || String(error) 
    });
  }
}; 