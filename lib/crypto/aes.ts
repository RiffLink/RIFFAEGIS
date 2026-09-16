import {
  sha256Hex,
  sha3_512Hex,
  bytesToBase64Url,
  base64UrlToBytes,
} from "./hashes";
import { EncryptedPdfResult } from "./types";

const AES_ALGORITHM = "AES-GCM";
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 12 bytes recommended for AES-GCM

/**
 * Get the Web Crypto subtle instance across Node.js and Browser environments
 */
function getSubtle(): SubtleCrypto {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error("Web Crypto API (crypto.subtle) is not supported in this environment.");
}

/**
 * Generate a new 256-bit AES-GCM symmetric key
 */
export async function generateAesKey(): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.generateKey(
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

/**
 * Export AES key as 32-byte raw Uint8Array
 */
export async function exportAesKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  const subtle = getSubtle();
  const raw = await subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

/**
 * Export AES key as Base64URL string (for URL hash fragment #key)
 */
export async function exportAesKeyBase64Url(key: CryptoKey): Promise<string> {
  const raw = await exportAesKeyRaw(key);
  return bytesToBase64Url(raw);
}

/**
 * Import AES key from raw 32 bytes
 */
export async function importAesKeyFromRaw(rawBytes: Uint8Array): Promise<CryptoKey> {
  if (rawBytes.byteLength !== 32) {
    throw new Error(`Invalid AES-256 key length: expected 32 bytes, received ${rawBytes.byteLength}`);
  }
  const subtle = getSubtle();
  return subtle.importKey(
    "raw",
    rawBytes as unknown as BufferSource,
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Import AES key from Base64URL string (e.g. from URL fragment #...)
 */
export async function importAesKeyFromBase64Url(base64Url: string): Promise<CryptoKey> {
  const rawBytes = base64UrlToBytes(base64Url.trim());
  return importAesKeyFromRaw(rawBytes);
}

/**
 * Encrypt bytes using AES-GCM-256.
 * Result prepends the 12-byte IV to the ciphertext + tag.
 */
export async function encryptBytes(
  plainBytes: Uint8Array,
  key: CryptoKey
): Promise<{ encryptedBytes: Uint8Array; iv: Uint8Array }> {
  const subtle = getSubtle();
  const iv = new Uint8Array(IV_LENGTH);
  globalThis.crypto.getRandomValues(iv);

  const ciphertextWithTagBuffer = await subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    key,
    plainBytes as unknown as BufferSource
  );

  const ciphertextWithTag = new Uint8Array(ciphertextWithTagBuffer);

  // Prepend IV to ciphertext + authentication tag
  const combined = new Uint8Array(IV_LENGTH + ciphertextWithTag.byteLength);
  combined.set(iv, 0);
  combined.set(ciphertextWithTag, IV_LENGTH);

  return {
    encryptedBytes: combined,
    iv,
  };
}

/**
 * Decrypt bytes with prepended 12-byte IV using AES-GCM-256
 */
export async function decryptBytes(
  encryptedBytesWithIv: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  if (encryptedBytesWithIv.byteLength < IV_LENGTH + 16) {
    throw new Error("Encrypted binary is too short (missing IV or authentication tag)");
  }

  const subtle = getSubtle();
  const iv = encryptedBytesWithIv.slice(0, IV_LENGTH);
  const ciphertextWithTag = encryptedBytesWithIv.slice(IV_LENGTH);

  const decryptedBuffer = await subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    key,
    ciphertextWithTag as unknown as BufferSource
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Complete PDF encryption pipeline:
 * 1. Computes SHA-256 and SHA3-512 hashes of original PDF
 * 2. Encrypts PDF using AES-GCM-256
 * 3. Returns encrypted bytes with metadata
 */
export async function encryptPdf(
  pdfBytes: Uint8Array,
  key: CryptoKey
): Promise<EncryptedPdfResult> {
  const originalSha256 = sha256Hex(pdfBytes);
  const originalSha3_512 = sha3_512Hex(pdfBytes);

  const { encryptedBytes, iv } = await encryptBytes(pdfBytes, key);

  return {
    encryptedBytes,
    iv,
    originalSha256,
    originalSha3_512,
    fileSizeBytes: pdfBytes.byteLength,
  };
}

/**
 * Complete PDF decryption and integrity assertion pipeline:
 * 1. Decrypts AES-GCM-256 binary
 * 2. Recalculates SHA-256 of decrypted binary
 * 3. Asserts exact 1:1 match with originalSha256. If mismatch, throws immediate integrity violation error.
 */
export async function decryptPdfAndVerify(
  encryptedBytesWithIv: Uint8Array,
  key: CryptoKey,
  expectedOriginalSha256: string
): Promise<Uint8Array> {
  const decryptedBytes = await decryptBytes(encryptedBytesWithIv, key);

  const actualSha256 = sha256Hex(decryptedBytes);
  if (actualSha256.toLowerCase() !== expectedOriginalSha256.toLowerCase()) {
    throw new Error(
      `INTEGRITY_VIOLATION: Decrypted PDF SHA-256 (${actualSha256}) does not match expected (${expectedOriginalSha256}). Document may have been tampered with or corrupted.`
    );
  }

  return decryptedBytes;
}
