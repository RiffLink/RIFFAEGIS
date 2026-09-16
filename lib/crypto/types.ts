/**
 * RiffAegis - Cryptographic Types & Interfaces
 */

export interface KeyPairMlDsa {
  publicKey: Uint8Array; // 1,952 bytes for ML-DSA-65
  secretKey: Uint8Array; // 4,032 bytes for ML-DSA-65
}

export interface EncryptedPdfResult {
  /**
   * Complete binary with 12-byte IV prepended to ciphertext + 16-byte authentication tag
   */
  encryptedBytes: Uint8Array;
  /**
   * 12-byte initialization vector
   */
  iv: Uint8Array;
  /**
   * Original PDF SHA-256 hex string
   */
  originalSha256: string;
  /**
   * Original PDF SHA3-512 hex string
   */
  originalSha3_512: string;
  /**
   * Original file size in bytes
   */
  fileSizeBytes: number;
}

export interface RiffKeyMetadata {
  version: "1.0";
  format: "riffkey";
  createdAt: string;
  deviceType: "desktop" | "mobile";
  kdf: {
    algorithm: "argon2id";
    params: {
      memorySizeKb: number; // 65536 (64MB) or 32768 (32MB)
      iterations: number;
      parallelism: number;
      saltBase64: string;
    };
  };
  cipher: {
    algorithm: "AES-256-GCM";
    ivBase64: string;
  };
  /**
   * Base64 encoded AES-GCM-256 encrypted payload (contains secret key + checksum)
   */
  encryptedSecretKeyBase64: string;
  /**
   * ML-DSA-65 public key in Base64 (1,952 bytes)
   */
  publicKeyBase64: string;
  /**
   * SHA-256 hash of public key in hex
   */
  publicKeyHash: string;
}

export interface AuditLogNode {
  id?: number;
  documentId: string;
  eventType:
    | "CREATED"
    | "IDENTITY_VERIFIED"
    | "VIEWED"
    | "INTEGRITY_VERIFIED"
    | "WEBAUTHN_CONSENT"
    | "REJECTED"
    | "CANCELLED"
    | "OTS_ANCHORED"
    | "OTS_UPGRADED"
    | "COMPLETED";
  payload: Record<string, unknown>;
  previousLogHash: string;
  currentLogHash: string;
  createdAt: string;
}

export type WebAuthnAuthLevel = "high_webauthn" | "medium_security_key" | "low_fallback";
