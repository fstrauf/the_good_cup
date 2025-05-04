import { verifyAuthToken } from '../auth';
import { getBodyJSON } from '../utils';
import { OpenAI } from 'openai';
import type { Context } from 'hono';

// Define expected request body structure
interface AnalyzeImageRequest {
    imageUrl: string;
    prompt?: string; // Optional custom prompt
}

// Define expected response structure from OpenAI (adapt as needed)
interface AnalyzeImageResponse {
    analysisText: string;
    // Potentially add structured data if the prompt asks for it
}

// --- POST /api/analyze-image Handler Logic ---
export async function handleAnalyzeImage(c: Context): Promise<AnalyzeImageResponse> {
    console.log('[analyzeImageHandler] POST handler invoked');
    const authResult = await verifyAuthToken(c.req);
    if (!authResult.userId) throw { status: authResult.status || 401, message: authResult.error || 'Unauthorized' };

    // Get OpenAI API key
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        console.error('[analyzeImageHandler] Missing OpenAI API key');
        throw { status: 500, message: 'Server configuration error' };
    }

    try {
        const body: AnalyzeImageRequest = await c.req.json();

        if (!body.imageUrl || typeof body.imageUrl !== 'string' || !body.imageUrl.startsWith('http')) {
            throw { status: 400, message: 'Valid imageUrl is required.' };
        }

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        const defaultPrompt = "Analyze this image of coffee beans. Describe their appearance, estimate the roast level (e.g., Light, Medium, Dark), and identify any visible defects or notable characteristics. Keep the description concise.";
        const userPrompt = body.prompt || defaultPrompt;

        console.log(`[analyzeImageHandler] Analyzing image: ${body.imageUrl}`);
        
        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Vision capabilities
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPrompt },
                        {
                            type: "image_url",
                            image_url: { url: body.imageUrl },
                        },
                    ],
                },
            ],
            max_tokens: 300, // Adjust token limit as needed
        });

        const analysisText = response.choices[0]?.message?.content;

        if (!analysisText) {
            throw { status: 500, message: 'No analysis content received from OpenAI API' };
        }
        
        console.log('[analyzeImageHandler] Analysis successful.');
        // Return a structured response
        return { analysisText: analysisText.trim() };

    } catch (error: any) {
        console.error('[analyzeImageHandler] Error:', error);
        // Check for specific OpenAI errors if possible
        if (error.response) { // Axios-like error structure
            console.error('OpenAI API Error details:', error.response.data);
        }
        throw { status: error.status || 500, message: error.message || 'Failed to analyze image.' };
    }
} 