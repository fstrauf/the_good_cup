// api/index.ts - Handles root path only

// No DB imports needed here unless root does something with DB

// --- Vercel Request Handler for / ---
export default async (req: any, res: any) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === '/') {
      console.log('[index.ts:/] Root GET handler invoked');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send('API Root OK - File Routing');
  } else {
      // Technically shouldn't be reached if Vercel routes correctly
      console.log(`[index.ts:NotFound] Route ${req.method} ${path} fallback`);
      return res.status(404).json({ message: 'Route not found via index.ts' });
  }
}; 

// No other helpers or routes needed here 