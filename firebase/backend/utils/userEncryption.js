// utils/userEncryption.js

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = crypto.scryptSync(
  process.env.ENCRYPTION_KEY || "fallback-key-32-chars-long-here!",
  "salt",
  32
);
const IV_LENGTH = 16;        // 16 bytes for GCM IV
const AUTH_TAG_LENGTH = 16;  // 16 bytes auth tag

export function encryptText(plaintext) {
  if (!plaintext) return null;

  // 1) Generate IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // 2) Create cipher with IV
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  cipher.setAAD(Buffer.from("additional-data"));

  // 3) Encrypt as buffers
  const encryptedBuffer = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag(); // 16 bytes

  // 4) Output format: iv || authTag || ciphertext, base64-encoded
  const combined = Buffer.concat([iv, authTag, encryptedBuffer]);
  return combined.toString("base64");
}

export function decryptText(encryptedBase64) {
  if (!encryptedBase64) return null;

  try {
    const data = Buffer.from(encryptedBase64, "base64");

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAAD(Buffer.from("additional-data"));
    decipher.setAuthTag(authTag);

    const decryptedBuffer = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decryptedBuffer.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error.message);
    return null;
  }
}

export function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber) return "";

  // Try to decrypt first
  const decrypted = decryptText(phoneNumber);
  const plainPhone = decrypted || phoneNumber;

  const cleanPhone = plainPhone.replace(/\D/g, "");
  if (cleanPhone.length < 4) return plainPhone;

  const visibleDigits = 4;
  const maskedPart = "*".repeat(Math.max(0, cleanPhone.length - visibleDigits));
  const visiblePart = cleanPhone.slice(-visibleDigits);

  return `${maskedPart}${visiblePart}`;
}

export function maskAddress(address) {
  if (!address) return "";

  const decrypted = decryptText(address);
  const plainAddress = decrypted || address;

  const parts = plainAddress.split(",");
  if (parts.length > 1) {
    return `${parts[0].trim()}, ***`;
  }

  if (plainAddress.length > 10) {
    return `${plainAddress.substring(0, 8)}...`;
  }

  return plainAddress;
}
