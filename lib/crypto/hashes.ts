import { sha256 } from "@noble/hashes/sha2.js";
import { sha3_512 } from "@noble/hashes/sha3.js";
import { hmac } from "@noble/hashes/hmac.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

const encoder = new TextEncoder();

export { bytesToHex, hexToBytes };

/**
 * Convert string or Uint8Array to Uint8Array
 */
export function ensureBytes(data: Uint8Array | string): Uint8Array {
  if (typeof data === "string") {
    return encoder.encode(data);
  }
  return data;
}

/**
 * Base64 encoding
 */
export function bytesToBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  const len = data.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Base64 decoding
 */
export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64URL encoding (RFC 4648 §5, URL-safe without padding)
 */
export function bytesToBase64Url(data: Uint8Array): string {
  return bytesToBase64(data)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Base64URL decoding
 */
export function base64UrlToBytes(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return base64ToBytes(base64);
}

/**
 * Compute SHA-256 digest
 */
export function sha256Bytes(data: Uint8Array | string): Uint8Array {
  return sha256(ensureBytes(data));
}

export function sha256Hex(data: Uint8Array | string): string {
  return bytesToHex(sha256Bytes(data));
}

/**
 * Compute SHA3-512 digest
 */
export function sha3_512Bytes(data: Uint8Array | string): Uint8Array {
  return sha3_512(ensureBytes(data));
}

export function sha3_512Hex(data: Uint8Array | string): string {
  return bytesToHex(sha3_512Bytes(data));
}

/**
 * Compute HMAC-SHA-256
 */
export function hmacSha256Bytes(key: Uint8Array, data: Uint8Array | string): Uint8Array {
  return hmac(sha256, key, ensureBytes(data));
}

export function hmacSha256Hex(key: Uint8Array, data: Uint8Array | string): string {
  return bytesToHex(hmacSha256Bytes(key, data));
}

/**
 * Merkle Tree Genesis Hash
 * Defined in design doc: SHA3-512("GENESIS:" || document_id)
 */
export function genesisHash(documentId: string): string {
  return sha3_512Hex(`GENESIS:${documentId}`);
}

/**
 * Recursively sort object keys for deterministic canonical JSON serialization
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
  return "{" + entries.join(",") + "}";
}

/**
 * Merkle Tree Log Node Hash
 * Deterministic SHA3-512 over previous_log_hash + event_type + canonical json payload + timestamp
 */
export function calculateLogHash(
  previousLogHash: string,
  eventType: string,
  payload: Record<string, unknown>,
  createdAtIso: string
): string {
  // Canonical sort keys to guarantee deterministic hashing across nested structures
  const sortedPayload = canonicalJsonStringify(payload);
  const canonicalString = `${previousLogHash}|${eventType}|${sortedPayload}|${createdAtIso}`;
  return sha3_512Hex(canonicalString);
}

/**
 * Creator WebAuthn Challenge Generator
 * challenge = HMAC-SHA-256(
 *   key: server_random_nonce_32bytes,
 *   data: original_sha256 || ml_dsa_public_key
 * )
 */
export function createCreatorWebAuthnChallenge(
  serverNonce: Uint8Array,
  originalSha256Hex: string,
  mlDsaPublicKey: Uint8Array
): Uint8Array {
  const originalBytes = encoder.encode(originalSha256Hex);
  const data = new Uint8Array(originalBytes.length + mlDsaPublicKey.length);
  data.set(originalBytes, 0);
  data.set(mlDsaPublicKey, originalBytes.length);
  return hmacSha256Bytes(serverNonce, data);
}

/**
 * Signer WebAuthn Challenge Generator
 * challenge = HMAC-SHA-256(
 *   key: server_random_nonce_32bytes,
 *   data: merkle_latest_node_hash
 * )
 */
export function createSignerWebAuthnChallenge(
  serverNonce: Uint8Array,
  merkleLatestNodeHash: string
): Uint8Array {
  return hmacSha256Bytes(serverNonce, encoder.encode(merkleLatestNodeHash));
}
