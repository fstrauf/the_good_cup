// Generic brew suggestion handler based on bean characteristics
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

// Extract JSON helper function
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

// Export a function that handles the request
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
    return res.status(405).json({ message: 'Method Not Allowed' });
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
    // Get bean data from request body
    const { bean } = req.body || {};
    
    if (!bean || !bean.name || !bean.brewMethod) {
      return res.status(400).json({ 
        error: 'Missing required parameters: bean object with name and brewMethod properties is required' 
      });
    }

    // Prepare data for prompt
    const beanName = bean.name;
    const brewMethod = bean.brewMethod;
    const country = bean.country || 'Unknown';
    const process = bean.process || 'Unknown';
    const roastLevel = bean.roastLevel || 'Unknown';
    const flavorNotes = Array.isArray(bean.flavorNotes) ? bean.flavorNotes.join(', ') : 'Unknown';
    
    // Calculate bean age if roasted date is provided
    const beanAge = bean.roastedDate ? calculateAgeDays(bean.roastedDate, Date.now()) : null;

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Construct prompt for OpenAI
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
  "suggestedGrindSize": "Suggested grind size (e.g. Fine, Medium-Fine, Medium, Medium-Coarse, Coarse)",
  "suggestedWaterTemp": 93,
  "suggestedSteepTimeSeconds": 150,
  "suggestedUseBloom": true,
  "suggestedBloomTimeSeconds": 30
}

Note that suggestedWaterTemp is in Celsius, suggestedSteepTimeSeconds and suggestedBloomTimeSeconds are in seconds. suggestedUseBloom is a boolean.`;

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    });

    // Get content from OpenAI response
    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return res.status(500).json({ error: 'No message content received from OpenAI API' });
    }

    // Parse JSON from OpenAI response
    const jsonResponse = extractJson(messageContent);

    if (jsonResponse) {
      // Add formatted times for convenience
      if (typeof jsonResponse.suggestedSteepTimeSeconds === 'number') {
        jsonResponse.steepTimeFormatted = formatTime(jsonResponse.suggestedSteepTimeSeconds);
      }
      if (typeof jsonResponse.suggestedBloomTimeSeconds === 'number') {
        jsonResponse.bloomTimeFormatted = formatTime(jsonResponse.suggestedBloomTimeSeconds);
      }
      
      // Return JSON response
      return res.status(200).json(jsonResponse);
    } else {
      console.error('Failed to extract/parse OpenAI response:', messageContent);
      return res.status(500).json({ 
        error: 'Failed to parse AI response as JSON',
        rawResponse: messageContent
      });
    }
  } catch (error) {
    console.error('Error processing generic brew suggestion:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message || String(error) 
    });
  }
}; 