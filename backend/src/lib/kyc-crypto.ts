import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * KYC Data Encryption/Decryption
 *
 * Encrypts sensitive KYC data at rest in the database using AES-256-GCM.
 *
 * Format: `IV(12bytes):AUTHTAG(16bytes):CIPHERTEXT(variable)` all base64url encoded
 * Structure: base64url(IV || AUTHTAG || CIPHERTEXT)
 *
 * Environment:
 *   KYC_ENCRYPTION_KEY: 32-byte hex string (generate with `openssl rand -hex 32`)
 *   In production (NODE_ENV=production): KYC_ENCRYPTION_KEY is required
 *   In development: auto-generates with warning if missing
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

let encryptionKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (encryptionKey) {
    return encryptionKey;
  }

  const keyEnv = process.env.KYC_ENCRYPTION_KEY;

  if (!keyEnv) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "KYC_ENCRYPTION_KEY environment variable is required in production. " +
          "Generate with: openssl rand -hex 32",
      );
    }

    console.warn(
      "[KYC-CRYPTO] ⚠️  KYC_ENCRYPTION_KEY not set in development. " +
        "Using default insecure key. Generate production key with: openssl rand -hex 32",
    );
    encryptionKey = Buffer.from(
      "0000000000000000000000000000000000000000000000000000000000000000",
      "hex",
    );
  } else {
    if (keyEnv.length !== 64) {
      throw new Error(
        `KYC_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${keyEnv.length} chars.`,
      );
    }
    encryptionKey = Buffer.from(keyEnv, "hex");
  }

  return encryptionKey;
}

/**
 * Encrypts KYC data object to encrypted string
 * @param data Object to encrypt (typically KycVerificationResult)
 * @returns Encrypted string in format: base64url(IV || AUTHTAG || CIPHERTEXT)
 */
export function encryptKycData(data: Record<string, any>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const jsonString = JSON.stringify(data);

  let encrypted = cipher.update(jsonString, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Combine: IV || AUTHTAG || CIPHERTEXT
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString("base64url");
}

/**
 * Decrypts encrypted KYC data string back to object
 * @param encrypted Encrypted string in format: base64url(IV || AUTHTAG || CIPHERTEXT)
 * @returns Decrypted object
 */
export function decryptKycData(encrypted: string): Record<string, any> {
  const key = getEncryptionKey();

  const combined = Buffer.from(encrypted, "base64url");

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error(
      "Invalid encrypted data: too short to contain IV and auth tag",
    );
  }

  const iv = combined.slice(0, IV_LENGTH);
  const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString("utf8"));
}
