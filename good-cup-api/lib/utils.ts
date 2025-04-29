// good-cup-api/lib/utils.ts

// --- Request Body Parser ---
export async function getBodyJSON(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}')); // Return empty object if body is empty
            } catch (e) {
                console.error('[Utils:BodyParse:Error] Invalid JSON:', e);
                reject(new Error('Invalid JSON in request body'));
            }
        });
        req.on('error', (err: Error) => {
            console.error('[Utils:ReqError] Request error:', err);
            reject(err);
        });
    });
}

// --- Other Helpers ---
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Add other potential reusable utils here 