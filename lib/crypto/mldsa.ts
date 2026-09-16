import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { KeyPairMlDsa } from "./types";
import {
  sha256Hex,
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
} from "./hashes";

export const ML_DSA_65_PUBLIC_KEY_LENGTH = 1952;
export const ML_DSA_65_SECRET_KEY_LENGTH = 4032;
export const ML_DSA_65_SIGNATURE_LENGTH = 3309;

const encoder = new TextEncoder();

/**
 * Generate a new ML-DSA-65 post-quantum key pair
 */
export function generateMlDsaKeyPair(): KeyPairMlDsa {
  const keys = ml_dsa65.keygen();

  if (keys.publicKey.byteLength !== ML_DSA_65_PUBLIC_KEY_LENGTH) {
    throw new Error(
      `Unexpected ML-DSA-65 public key size: ${keys.publicKey.byteLength} (expected ${ML_DSA_65_PUBLIC_KEY_LENGTH})`
    );
  }
  if (keys.secretKey.byteLength !== ML_DSA_65_SECRET_KEY_LENGTH) {
    throw new Error(
      `Unexpected ML-DSA-65 secret key size: ${keys.secretKey.byteLength} (expected ${ML_DSA_65_SECRET_KEY_LENGTH})`
    );
  }

  return {
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
  };
}

/**
 * Sign the document's SHA3-512 hex string using ML-DSA-65
 */
export function signOriginalHash(
  secretKey: Uint8Array,
  originalSha3_512Hex: string
): Uint8Array {
  if (secretKey.byteLength !== ML_DSA_65_SECRET_KEY_LENGTH) {
    throw new Error(
      `Invalid secret key length: ${secretKey.byteLength} (expected ${ML_DSA_65_SECRET_KEY_LENGTH})`
    );
  }
  const messageBytes = encoder.encode(originalSha3_512Hex.toLowerCase().trim());
  const signature = ml_dsa65.sign(messageBytes, secretKey);

  if (signature.byteLength !== ML_DSA_65_SIGNATURE_LENGTH) {
    throw new Error(
      `Unexpected ML-DSA-65 signature size: ${signature.byteLength} (expected ${ML_DSA_65_SIGNATURE_LENGTH})`
    );
  }
  return signature;
}

/**
 * Verify an ML-DSA-65 signature against the document's SHA3-512 hex string
 */
export function verifyOriginalSignature(
  signature: Uint8Array,
  originalSha3_512Hex: string,
  publicKey: Uint8Array
): boolean {
  if (publicKey.byteLength !== ML_DSA_65_PUBLIC_KEY_LENGTH) {
    return false;
  }
  if (signature.byteLength !== ML_DSA_65_SIGNATURE_LENGTH) {
    return false;
  }

  try {
    const messageBytes = encoder.encode(originalSha3_512Hex.toLowerCase().trim());
    return ml_dsa65.verify(signature, messageBytes, publicKey);
  } catch {
    return false;
  }
}

/**
 * Compute the SHA-256 fingerprint/hash of the ML-DSA public key
 * Used for database lookups and creator identity indexing
 */
export function getPublicKeyHash(publicKey: Uint8Array): string {
  return sha256Hex(publicKey);
}

export {
  bytesToHex as mlDsaBytesToHex,
  hexToBytes as mlDsaHexToBytes,
  bytesToBase64 as mlDsaBytesToBase64,
  base64ToBytes as mlDsaBase64ToBytes,
};
