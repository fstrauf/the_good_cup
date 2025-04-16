// Registration handler for Vercel's serverless function
const { drizzle } = require('drizzle-orm/neon-http');
const { neon } = require('@neondatabase/serverless');
const { eq } = require('drizzle-orm');
const crypto = require('crypto');

// Constants
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-not-for-production';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

// --- Web Crypto Helper Functions ---
// Function to convert ArrayBuffer to Base64 string (Edge compatible)
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
};

// Function to hash password using PBKDF2 with Web Crypto
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_LENGTH_BYTES * 8 // length in bits
  );

  const saltBase64 = arrayBufferToBase64(salt);
  const hashBase64 = arrayBufferToBase64(hashBuffer);
  return `${saltBase64}$${hashBase64}`; // Store salt and hash together
}

// Database setup - Connect to Neon Postgres
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const sql = neon(connectionString);

// Define tables explicitly instead of using schema
// Direct table definition without using schema structure
const db = drizzle(sql);

// Define table structure directly
const usersTable = {
  id: 'id',
  email: 'email',
  passwordHash: 'password_hash',
  name: 'name',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

// Export the function for Vercel serverless usage
module.exports = async (req, res) => {
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Extract registration details
    const { email, password, name } = req.body || {};
    
    // Basic validation
    if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }
    
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }
    
    if (name && typeof name !== 'string') {
      return res.status(400).json({ message: 'Invalid name format.' });
    }
    
    // Check if user already exists - use direct SQL query to avoid schema issues
    const existingUserQuery = await sql`
      SELECT email FROM good_cup.users 
      WHERE email = ${email.toLowerCase()}
      LIMIT 1
    `;
    
    if (existingUserQuery.length > 0) {
      return res.status(409).json({ message: 'User with this email already exists.' });
    }
    
    // Hash the password
    const passwordHash = await hashPassword(password);
    
    // Insert new user with direct SQL query
    const result = await sql`
      INSERT INTO good_cup.users 
        (email, password_hash, name) 
      VALUES 
        (${email.toLowerCase()}, ${passwordHash}, ${name || null})
      RETURNING id, email, name
    `;
    
    if (!result || result.length === 0) {
      throw new Error('Failed to insert user.');
    }
    
    const newUser = result[0];
    
    // Return success response
    return res.status(201).json({
      message: 'User registered successfully.',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}; 