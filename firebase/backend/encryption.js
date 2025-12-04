import crypto from 'crypto';

// CRITICAL: This key must be loaded from a secure source (e.g., KMS, secret manager)
const ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY;

// The key must be a 32-byte (256-bit) key, represented as a 64-character hex string.
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    if (process.env.NODE_ENV !== 'production') {
        console.warn("⚠️ WARNING: FIELD_ENCRYPTION_KEY is missing or invalid. Using a placeholder key for development.");
        const placeholderKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        global.KEY = Buffer.from(placeholderKey, 'hex');
    } else {
        throw new Error("CRITICAL: FIELD_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
    }
} else {
    global.KEY = Buffer.from(ENCRYPTION_KEY, 'hex');
}

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} text - The plaintext to encrypt.
 * @returns {string} The encrypted data as a hex string (IV:Content:AuthTag).
 */
export function encrypt(text) {
    if (!text) return null;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, global.KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * Decrypts an encrypted string.
 * @param {string} encryptedText - The encrypted data (IV:Content:AuthTag).
 * @returns {string} The decrypted plaintext.
 */
export function decrypt(encryptedText) {
    if (!encryptedText) return null;
    
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format. Expected IV:Content:AuthTag.');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, global.KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

export function zeroizeKey() {
    global.KEY.fill(0);
    console.log("Encryption key zeroized from memory.");
}
