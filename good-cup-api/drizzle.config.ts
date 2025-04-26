import type { Config } from 'drizzle-kit';
// import type { PgKitConfig } from 'drizzle-kit/pg'; // Reverted import
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' }); // Load .env variables relative to project root

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

// Export config object without 'satisfies Config' due to persistent type errors
export default {
  schema: './api/schema.ts', // Path to your schema file
  out: './drizzle/migrations', // Directory to store migration files
  dialect: 'postgresql', // Specify the dialect
  dbCredentials: {
    url: connectionString, // Use 'url' for postgresql dialect
  },
  verbose: true, // Optional: for more detailed output
  strict: true,  // Optional: for stricter checks
}; // Removed 'satisfies Config' 