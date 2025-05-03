// api/index.ts - Minimal Node.js Handler with Path Check

export default function handler(req: any, res: any) {
  console.log(`[Minimal Handler+] Received Path: '${req.url}', Method: ${req.method}`);
  
  // Explicitly check for the health path
  if (req.url === '/api/health' && req.method === 'GET') {
      console.log('[Minimal Handler+] Matched /api/health');
      res.status(200).json({ 
          message: "Minimal handler direct hit!", 
          path: req.url,
          timestamp: new Date().toISOString() 
      });
      return; // Important: Stop execution after sending response
  }

  // Handle any other path with 404
  console.log(`[Minimal Handler+] Path '${req.url}' not handled.`);
  res.status(404).json({ 
      message: "Route not found by minimal handler",
      path: req.url
  });
} 