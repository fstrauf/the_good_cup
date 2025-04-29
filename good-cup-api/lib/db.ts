import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import * as schema from '../api/schema'; // Adjust path relative to lib

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[db.ts:Init:Error] FATAL: DATABASE_URL missing.');
  throw new Error('DATABASE_URL environment variable is not set.');
}

let sqlSingleton: NeonQueryFunction<boolean, boolean>;
let dbSingleton: NeonHttpDatabase<typeof schema>;

try {
    console.log('[db.ts:Init] Initializing Neon client...');
    sqlSingleton = neon(connectionString);
    console.log('[db.ts:Init] Neon client initialized.');

    console.log('[db.ts:Init] Initializing Drizzle client...');
    dbSingleton = drizzle(sqlSingleton, { schema, logger: process.env.NODE_ENV !== 'production' }); 
    console.log('[db.ts:Init] Drizzle client initialized.');
} catch (initError) {
    console.error('[db.ts:Init:Error] Database initialization failed:', initError);
    // Throw error during initialization phase if DB setup fails critically
    throw new Error(`Database initialization failed: ${initError}`);
}

export const sql = sqlSingleton;
export const db = dbSingleton; 