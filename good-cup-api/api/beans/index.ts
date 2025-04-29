import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../lib/db'; // Corrected path: up two levels, then lib
import { beansTable } from '../schema'; // Corrected path: up one level
import { eq } from 'drizzle-orm';
import { verifyJwt, JWT_SECRET } from '../../lib/auth'; // Corrected path: up two levels, then lib

export default async (req: VercelRequest, res: VercelResponse) => {
  // --- CORS Handling ---
  res.setHeader('Access-Control-Allow-Origin', '*'); // Or specific origin
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --- Authentication ---
  const authHeader = req.headers.authorization;
  let userId: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      if (!JWT_SECRET) {
        console.error("Authentication error: JWT_SECRET not configured.");
        return res.status(500).json({ message: 'Server configuration error' });
      }
      const decoded = verifyJwt(token, JWT_SECRET); // Use verifyJwt
      if (!decoded || !decoded.userId) {
        return res.status(401).json({ message: 'Invalid token payload' });
      }
      userId = decoded.userId as string;
    } catch (error) {
      console.error("Token verification failed:", error);
      // Handle specific error like expiration if verifyJwt throws it
      const isExpired = error instanceof Error && error.message === 'JwtTokenExpired';
      return res.status(401).json({ message: isExpired ? 'Token expired' : 'Invalid or expired token' });
    }
  } else {
    return res.status(401).json({ message: 'Authorization header missing or invalid' });
  }

  if (!userId) {
      return res.status(401).json({ message: 'Could not verify user identity' });
  }

  // --- Route Handling ---
  try {
    if (req.method === 'GET') {
      // --- GET /api/beans (List Beans) ---
      const userBeans = await db.select().from(beansTable).where(eq(beansTable.userId, userId)).orderBy(beansTable.createdAt);
      return res.status(200).json(userBeans);

    } else if (req.method === 'POST') {
      // --- POST /api/beans (Add Bean) ---
      // Use 'any' for req.body initially, relying on runtime checks
      const { name, ...beanData }: { name?: string; [key: string]: any } = req.body || {}; 

      if (!name) {
        return res.status(400).json({ message: 'Bean name is required' });
      }

      // Prepare data for insertion
      const dataToInsert = {
        ...beanData,
        name: name, // Ensure name is included
        userId: userId, // Add the authenticated user ID
        // Drizzle handles createdAt/updatedAt defaults if defined in schema
      };

      const newBean = await db.insert(beansTable).values(dataToInsert).returning();

      if (!newBean || newBean.length === 0) {
          throw new Error("Failed to insert bean, database did not return the new record.");
      }

      return res.status(201).json(newBean[0]); // Return the newly created bean

    } else {
      // --- Method Not Allowed ---
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
  } catch (error: any) {
    console.error(`Error in /api/beans (${req.method}):`, error);
    return res.status(500).json({ 
      message: 'Internal Server Error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}; 