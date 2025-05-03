// You might not need req/res if it's just a static response
export async function handleHealthCheck(req: any, res: any) {
    console.log('[healthHandler] GET handler invoked');
    // Simple health check response
    return { status: 'OK', timestamp: new Date().toISOString() };
} 