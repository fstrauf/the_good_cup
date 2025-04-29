import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' }); // Load .env.local for DB connection string

export default defineConfig({
  schema: "./api/schema.ts",
  out: "./drizzle/migrations",
  dialect: 'postgresql', // Specify the dialect
  dbCredentials: {
    // Use the connection string from environment variables
    url: process.env.NEON_DATABASE_URL!, 
  },
  verbose: true,
  strict: true,
}); 