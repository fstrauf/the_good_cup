import crypto from 'crypto';

// --- Constants ---
export const JWT_SECRET = process.env.JWT_SECRET;
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

// --- Base64 Helpers (moved from utils potentially) ---
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  return Buffer.from(buffer).toString('base64');
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary_string = Buffer.from(base64, 'base64').toString('binary');
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
  return bytes;
};

// --- Password Hashing ---
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, passwordKey, KEY_LENGTH_BYTES * 8);
  const saltBase64 = arrayBufferToBase64(salt);
  const hashBase64 = arrayBufferToBase64(hashBuffer);
  return `${saltBase64}$${hashBase64}`; 
}

export async function verifyPassword(password: string, storedHashString: string): Promise<boolean> {
   try {
        const [saltBase64, storedHashBase64] = storedHashString.split('$');
        if (!saltBase64 || !storedHashBase64) { console.error('[AuthLib:Error] Invalid hash format'); return false; }
        const salt = base64ToUint8Array(saltBase64);
        const storedHash = base64ToUint8Array(storedHashBase64);
        const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
        const derivedHashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, passwordKey, storedHash.length * 8);
        const derivedHash = new Uint8Array(derivedHashBuffer);
        if (derivedHash.length !== storedHash.length) return false;
        let diff = 0;
        for (let i = 0; i < derivedHash.length; i++) { diff |= derivedHash[i] ^ storedHash[i]; }
        return diff === 0;
    } catch (error) {
        console.error('[AuthLib:Error] Password verification error:', error);
        return false;
    }
}

// --- JWT Handling ---
export function createJwt(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${encodedHeader}.${encodedPayload}`);
  const signature = hmac.digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwt(token: string, secret: string): { [key: string]: any } | null {
    try {
        const [encodedHeader, encodedPayload, signature] = token.split('.');
        if (!encodedHeader || !encodedPayload || !signature) return null;
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(`${encodedHeader}.${encodedPayload}`);
        const calculatedSignature = hmac.digest('base64url');
        if (calculatedSignature !== signature) {
            console.warn('[AuthLib:Verify] Invalid JWT signature');
            return null;
        }
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() / 1000 > payload.exp) {
            console.warn('[AuthLib:Verify] JWT expired');
            throw new Error('JwtTokenExpired');
        }
        return payload;
    } catch (error) {
        console.error('[AuthLib:Verify] Error:', error);
        if (error instanceof Error && error.message === 'JwtTokenExpired') throw error;
        return null;
    }
}

// Updated to work with Hono's request object (c.req)
// Takes the Hono request object as input
export async function verifyAuthToken(req: any): Promise<{ userId: string | null; error?: string; status?: number }> {
  // Access header using Hono's c.req.header() method
  const authHeader = req.header('authorization'); 
  
  if (!JWT_SECRET) { 
      console.error('[AuthLib:Error] JWT_SECRET missing'); 
      return { userId: null, error: 'Config Error', status: 500 }; 
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) { 
      return { userId: null, error: 'Unauthorized: Missing/invalid token format', status: 401 }; 
  }
  
  const token = authHeader.substring(7);
  try {
    const payload = verifyJwt(token, JWT_SECRET); // verifyJwt remains the same
    if (!payload || !payload.userId) { 
        return { userId: null, error: 'Unauthorized: Invalid token payload', status: 401 }; 
    }
    console.log(`[AuthLib:Success] User Verified: ${payload.userId}`); // Log success
    return { userId: payload.userId as string };
  } catch (error) {
    console.error('[AuthLib:Verify Error] Token verification failed:', error);
    const isExpired = error instanceof Error && error.message === 'JwtTokenExpired';
    return { userId: null, error: isExpired ? 'Unauthorized: Token expired' : 'Unauthorized: Invalid token', status: 401 };
  }
} 