export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const pathname = url.pathname.startsWith('/api')
                   ? url.pathname.substring(4) // Remove /api prefix
                   : url.pathname;

  console.log(`--- Basic Edge Handler Invoked: ${req.method} ${pathname} ---`);

  if (req.method === 'GET' && pathname === '/') {
    return new Response(
      JSON.stringify({ success: true, message: 'Basic GET / route hit' }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  if (req.method === 'POST' && pathname === '/auth/login') {
    // Optionally read body if needed for a real test: const body = await req.text();
    return new Response(
      JSON.stringify({ success: true, message: 'Basic POST /auth/login route hit' }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  // Return 404 for any other path
  return new Response('Not Found', { status: 404 });
} 