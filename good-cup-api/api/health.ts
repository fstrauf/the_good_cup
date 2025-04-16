import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  response.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Good Cup API Health Check',
    environment: process.env.NODE_ENV || 'unknown'
  });
} 