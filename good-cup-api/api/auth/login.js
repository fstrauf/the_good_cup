// Login handler for Vercel serverless function
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// Constants
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-not-for-production';
const PBKDF2_ITERATIONS = 100000;

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

// Function to convert Base64 string to Uint8Array (Edge compatible)
const base64ToUint8Array = (base64) => {
  const binary_string = Buffer.from(base64, 'base64').toString('binary');
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
};

// Function to verify password against stored hash
async function verifyPassword(password, storedHashString) {
  try {
    const [saltBase64, storedHashBase64] = storedHashString.split('$');
    if (!saltBase64 || !storedHashBase64) {
      console.error('Invalid stored hash format');
      return false;
    }

    const salt = base64ToUint8Array(saltBase64);
    const storedHash = base64ToUint8Array(storedHashBase64);

    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedHashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      passwordKey,
      storedHash.length * 8
    );

    const derivedHash = new Uint8Array(derivedHashBuffer);

    // Constant-time comparison
    if (derivedHash.length !== storedHash.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < derivedHash.length; i++) {
      diff |= derivedHash[i] ^ storedHash[i];
    }
    return diff === 0;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

// Simple JWT token creation
function createJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${encodedHeader}.${encodedPayload}`);
  const signature = hmac.digest('base64url');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Database setup - Connect to Neon Postgres
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const sql = neon(connectionString);

// Export a function that handles the request
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
    // Get user credentials
    const { email, password } = req.body || {};
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    // Keep test account for backward compatibility
    if (email === 'test@example.com' && password === 'password123') {
      const secret = process.env.JWT_SECRET || 'test-secret-key';
      const token = createJwt({ 
        userId: 'test-user-123',
        email,
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)  // 7 days
      }, secret);
      
      return res.status(200).json({
        token,
        user: {
          id: 'test-user-123',
          email,
          name: 'Test User'
        }
      });
    }
    
    // Find user in database
    const userQuery = await sql`
      SELECT id, email, name, password_hash 
      FROM good_cup.users 
      WHERE email = ${email.toLowerCase()}
      LIMIT 1
    `;
    
    if (!userQuery || userQuery.length === 0) {
      return res.status(401).json({ 
        message: 'Invalid email or password'
      });
    }
    
    const user = userQuery[0];
    
    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        message: 'Invalid email or password'
      });
    }
    
    // Create JWT token
    const secret = process.env.JWT_SECRET || 'test-secret-key';
    const token = createJwt({ 
      userId: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)  // 7 days
    }, secret);
    
    // Return user data and token
    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}; 