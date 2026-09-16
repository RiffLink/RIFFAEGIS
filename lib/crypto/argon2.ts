import { argon2id } from "hash-wasm";
import { KeyPairMlDsa, RiffKeyMetadata } from "./types";
import {
  bytesToBase64,
  base64ToBytes,
  sha256Hex,
} from "./hashes";
import { encryptBytes, decryptBytes, importAesKeyFromRaw } from "./aes";
import { ML_DSA_65_SECRET_KEY_LENGTH, ML_DSA_65_PUBLIC_KEY_LENGTH } from "./mldsa";

const SALT_LENGTH = 16;

export interface Argon2Profile {
  memorySizeKb: number;
  iterations: number;
  parallelism: number;
}

export const DESKTOP_PROFILE: Argon2Profile = {
  memorySizeKb: 65536, // 64 MB
  iterations: 3,
  parallelism: 4,
};

export const MOBILE_PROFILE: Argon2Profile = {
  memorySizeKb: 32768, // 32 MB
  iterations: 6,
  parallelism: 1,
};

/**
 * Derive a 256-bit (32 bytes) AES encryption key from a passphrase using Argon2id
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  profile: Argon2Profile
): Promise<Uint8Array> {
  const derived = await argon2id({
    password: passphrase,
    salt,
    parallelism: profile.parallelism,
    iterations: profile.iterations,
    memorySize: profile.memorySizeKb,
    hashLength: 32, // 256-bit AES key
    outputType: "binary",
  });
  return new Uint8Array(derived);
}

/**
 * Export ML-DSA keypair to an encrypted .riffkey JSON file
 */
export async function exportRiffKey(
  keyPair: KeyPairMlDsa,
  passphrase: string,
  isMobile = false
): Promise<string> {
  if (keyPair.secretKey.byteLength !== ML_DSA_65_SECRET_KEY_LENGTH) {
    throw new Error(`Invalid secret key length: ${keyPair.secretKey.byteLength}`);
  }
  if (keyPair.publicKey.byteLength !== ML_DSA_65_PUBLIC_KEY_LENGTH) {
    throw new Error(`Invalid public key length: ${keyPair.publicKey.byteLength}`);
  }

  const profile = isMobile ? MOBILE_PROFILE : DESKTOP_PROFILE;
  const salt = new Uint8Array(SALT_LENGTH);
  globalThis.crypto.getRandomValues(salt);

  // Derive AES key via Argon2id
  const rawAesKey = await deriveKeyFromPassphrase(passphrase, salt, profile);
  const cryptoKey = await importAesKeyFromRaw(rawAesKey);

  // Encrypt secret key with AES-256-GCM
  const { encryptedBytes, iv } = await encryptBytes(keyPair.secretKey, cryptoKey);

  const metadata: RiffKeyMetadata = {
    version: "1.0",
    format: "riffkey",
    createdAt: new Date().toISOString(),
    deviceType: isMobile ? "mobile" : "desktop",
    kdf: {
      algorithm: "argon2id",
      params: {
        memorySizeKb: profile.memorySizeKb,
        iterations: profile.iterations,
        parallelism: profile.parallelism,
        saltBase64: bytesToBase64(salt),
      },
    },
    cipher: {
      algorithm: "AES-256-GCM",
      ivBase64: bytesToBase64(iv),
    },
    encryptedSecretKeyBase64: bytesToBase64(encryptedBytes),
    publicKeyBase64: bytesToBase64(keyPair.publicKey),
    publicKeyHash: sha256Hex(keyPair.publicKey),
  };

  return JSON.stringify(metadata, null, 2);
}

/**
 * Decrypt and import ML-DSA keypair from a .riffkey JSON string
 */
export async function importRiffKey(
  riffKeyJson: string,
  passphrase: string
): Promise<KeyPairMlDsa> {
  let parsed: RiffKeyMetadata;
  try {
    parsed = JSON.parse(riffKeyJson);
  } catch {
    throw new Error("Invalid .riffkey file: JSON syntax error");
  }

  if (parsed.format !== "riffkey" || parsed.version !== "1.0") {
    throw new Error("Invalid .riffkey format: unsupported version or format");
  }

  const salt = base64ToBytes(parsed.kdf.params.saltBase64);
  const profile: Argon2Profile = {
    memorySizeKb: parsed.kdf.params.memorySizeKb,
    iterations: parsed.kdf.params.iterations,
    parallelism: parsed.kdf.params.parallelism,
  };

  // Re-derive AES key using the parameters stored in the header
  const rawAesKey = await deriveKeyFromPassphrase(passphrase, salt, profile);
  const cryptoKey = await importAesKeyFromRaw(rawAesKey);

  const encryptedBytes = base64ToBytes(parsed.encryptedSecretKeyBase64);

  let decryptedSecretKey: Uint8Array;
  try {
    decryptedSecretKey = await decryptBytes(encryptedBytes, cryptoKey);
  } catch {
    throw new Error("Failed to decrypt .riffkey: Incorrect passphrase or corrupted file");
  }

  if (decryptedSecretKey.byteLength !== ML_DSA_65_SECRET_KEY_LENGTH) {
    throw new Error("Decrypted secret key size is invalid");
  }

  const publicKey = base64ToBytes(parsed.publicKeyBase64);
  if (publicKey.byteLength !== ML_DSA_65_PUBLIC_KEY_LENGTH) {
    throw new Error("Public key in .riffkey is invalid");
  }

  return {
    publicKey,
    secretKey: decryptedSecretKey,
  };
}
