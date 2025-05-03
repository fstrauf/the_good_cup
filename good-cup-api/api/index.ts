// api/index.ts - Minimal Node.js Handler Test

export default function handler(req: any, res: any) {
  console.log(`[Minimal Handler] Received Path: '${req.url}', Method: ${req.method}`);
  
  // Immediately send a simple response
  res.status(200).json({ 
      message: "Minimal handler executed successfully!", 
      path: req.url,
      timestamp: new Date().toISOString() 
  });
} 