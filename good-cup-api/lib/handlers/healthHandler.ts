import type { Context } from 'hono';

// You might not need req/res if it's just a static response
export async function handleHealthCheck(c: Context) {
    console.log('[healthHandler] GET handler invoked');
    // Simple health check response
    return { status: 'OK', timestamp: new Date().toISOString() };
} 