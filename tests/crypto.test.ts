import { describe, it, expect } from "vitest";
import {
  sha256Hex,
  sha3_512Hex,
  hmacSha256Hex,
  bytesToBase64Url,
  base64UrlToBytes,
  genesisHash,
  calculateLogHash,
  createCreatorWebAuthnChallenge,
  createSignerWebAuthnChallenge,
  generateAesKey,
  exportAesKeyBase64Url,
  importAesKeyFromBase64Url,
  encryptPdf,
  decryptPdfAndVerify,
  generateMlDsaKeyPair,
  signOriginalHash,
  verifyOriginalSignature,
  getPublicKeyHash,
  exportRiffKey,
  importRiffKey,
  hasPdfMagicBytes,
  validatePdfFile,
  ML_DSA_65_PUBLIC_KEY_LENGTH,
  ML_DSA_65_SECRET_KEY_LENGTH,
  ML_DSA_65_SIGNATURE_LENGTH,
} from "@/lib/crypto";

describe("RiffAegis Crypto Suite", () => {
  describe("Hashes & Challenges", () => {
    it("should compute SHA-256 and SHA3-512 hex correctly", () => {
      const input = "Hello, RiffAegis!";
      const sha256 = sha256Hex(input);
      const sha3 = sha3_512Hex(input);

      expect(sha256).toHaveLength(64);
      expect(sha3).toHaveLength(128);
    });

    it("should compute HMAC-SHA-256", () => {
      const key = new Uint8Array([1, 2, 3, 4]);
      const data = "test-data";
      const hmac1 = hmacSha256Hex(key, data);
      const hmac2 = hmacSha256Hex(key, data);
      expect(hmac1).toEqual(hmac2);
      expect(hmac1).toHaveLength(64);
    });

    it("should compute Merkle Tree Genesis Hash as defined in spec", () => {
      const docId = "doc-uuid-1234";
      const genesis = genesisHash(docId);
      expect(genesis).toEqual(sha3_512Hex(`GENESIS:${docId}`));
      expect(genesis).toHaveLength(128);
    });

    it("should compute deterministic audit log hash", () => {
      const prevHash = genesisHash("doc-1");
      const eventType = "IDENTITY_VERIFIED";
      const payload = { email: "signer@example.com", ip: "127.0.0.1" };
      const createdAt = "2026-09-15T12:00:00.000Z";

      const hash1 = calculateLogHash(prevHash, eventType, payload, createdAt);
      const hash2 = calculateLogHash(prevHash, eventType, { ip: "127.0.0.1", email: "signer@example.com" }, createdAt);
      expect(hash1).toEqual(hash2);
      expect(hash1).toHaveLength(128);
    });

    it("should build WebAuthn challenges according to HMAC binding spec", () => {
      const serverNonce = new Uint8Array(32).fill(7);
      const originalSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      const mlDsaPublicKey = new Uint8Array(ML_DSA_65_PUBLIC_KEY_LENGTH).fill(1);

      const creatorChallenge = createCreatorWebAuthnChallenge(serverNonce, originalSha256, mlDsaPublicKey);
      expect(creatorChallenge.byteLength).toEqual(32);

      const signerChallenge = createSignerWebAuthnChallenge(serverNonce, "merkle_root_hash_node");
      expect(signerChallenge.byteLength).toEqual(32);
    });

    it("should encode and decode Base64URL without padding or special characters", () => {
      const data = new Uint8Array([251, 255, 254, 0, 15, 128]);
      const encoded = bytesToBase64Url(data);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");

      const decoded = base64UrlToBytes(encoded);
      expect(Array.from(decoded)).toEqual(Array.from(data));
    });
  });

  describe("AES-256-GCM Encryption & Verification", () => {
    it("should generate key, export to Base64URL, and re-import", async () => {
      const key = await generateAesKey();
      const b64url = await exportAesKeyBase64Url(key);
      expect(typeof b64url).toBe("string");
      expect(b64url.length).toBeGreaterThan(30);

      const importedKey = await importAesKeyFromBase64Url(b64url);
      expect(importedKey).toBeDefined();
    });

    it("should encrypt and decrypt PDF with integrity check", async () => {
      const dummyPdf = new TextEncoder().encode("%PDF-1.7\nSample document text content for testing.");
      const key = await generateAesKey();

      const encResult = await encryptPdf(dummyPdf, key);
      expect(encResult.encryptedBytes.byteLength).toBeGreaterThan(dummyPdf.byteLength);
      expect(encResult.fileSizeBytes).toEqual(dummyPdf.byteLength);
      expect(encResult.originalSha256).toEqual(sha256Hex(dummyPdf));
      expect(encResult.originalSha3_512).toEqual(sha3_512Hex(dummyPdf));

      // Decrypt and verify
      const decrypted = await decryptPdfAndVerify(encResult.encryptedBytes, key, encResult.originalSha256);
      expect(new TextDecoder().decode(decrypted)).toEqual(new TextDecoder().decode(dummyPdf));
    });

    it("should throw error if decrypted PDF does not match expected hash", async () => {
      const dummyPdf = new TextEncoder().encode("%PDF-1.7\nOriginal text");
      const key = await generateAesKey();
      const encResult = await encryptPdf(dummyPdf, key);

      const wrongHash = sha256Hex("completely-different-content");
      await expect(
        decryptPdfAndVerify(encResult.encryptedBytes, key, wrongHash)
      ).rejects.toThrow(/INTEGRITY_VIOLATION/);
    });
  });

  describe("ML-DSA-65 Post-Quantum Signatures", () => {
    it("should generate keys of exact NIST FIPS 204 specification lengths", () => {
      const keyPair = generateMlDsaKeyPair();
      expect(keyPair.publicKey.byteLength).toEqual(ML_DSA_65_PUBLIC_KEY_LENGTH); // 1,952 bytes
      expect(keyPair.secretKey.byteLength).toEqual(ML_DSA_65_SECRET_KEY_LENGTH); // 4,032 bytes

      const pkHash = getPublicKeyHash(keyPair.publicKey);
      expect(pkHash).toHaveLength(64);
    });

    it("should sign original SHA3-512 and verify correctly", () => {
      const keyPair = generateMlDsaKeyPair();
      const originalSha3 = sha3_512Hex("%PDF-1.7\nDocument content to sign");

      const signature = signOriginalHash(keyPair.secretKey, originalSha3);
      expect(signature.byteLength).toEqual(ML_DSA_65_SIGNATURE_LENGTH); // 3,309 bytes

      const isValid = verifyOriginalSignature(signature, originalSha3, keyPair.publicKey);
      expect(isValid).toBe(true);

      // Tampered document check
      const tamperedSha3 = sha3_512Hex("%PDF-1.7\nTampered document");
      const isTamperedValid = verifyOriginalSignature(signature, tamperedSha3, keyPair.publicKey);
      expect(isTamperedValid).toBe(false);
    });
  });

  describe("Argon2id .riffkey Keystore", () => {
    it("should export keypair to .riffkey and import with passphrase (desktop profile)", async () => {
      const keyPair = generateMlDsaKeyPair();
      const passphrase = "CorrectHorseBatteryStaple!2026";

      // Export
      const riffKeyJson = await exportRiffKey(keyPair, passphrase, false);
      const parsed = JSON.parse(riffKeyJson);

      expect(parsed.format).toEqual("riffkey");
      expect(parsed.version).toEqual("1.0");
      expect(parsed.kdf.algorithm).toEqual("argon2id");
      expect(parsed.kdf.params.memorySizeKb).toEqual(65536);

      // Import with correct passphrase
      const restored = await importRiffKey(riffKeyJson, passphrase);
      expect(Array.from(restored.publicKey)).toEqual(Array.from(keyPair.publicKey));
      expect(Array.from(restored.secretKey)).toEqual(Array.from(keyPair.secretKey));
    });

    it("should fail import when using wrong passphrase", async () => {
      const keyPair = generateMlDsaKeyPair();
      const passphrase = "SecretPassword123";

      const riffKeyJson = await exportRiffKey(keyPair, passphrase, true);

      await expect(
        importRiffKey(riffKeyJson, "WrongPassword456")
      ).rejects.toThrow(/Failed to decrypt \.riffkey/);
    });
  });

  describe("PDF Magic Byte Validator", () => {
    it("should accept valid PDF headers (%PDF-)", () => {
      const validPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
      expect(hasPdfMagicBytes(validPdf)).toBe(true);

      const result = validatePdfFile(validPdf);
      expect(result.isValid).toBe(true);
    });

    it("should reject non-PDF files", () => {
      const invalid = new TextEncoder().encode("<html><body>Not a PDF</body></html>");
      expect(hasPdfMagicBytes(invalid)).toBe(false);

      const result = validatePdfFile(invalid);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("%PDF-");
    });

    it("should reject files exceeding 20MB", () => {
      const fakeLarge = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
      const result = validatePdfFile(fakeLarge, 4); // max 4 bytes
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("exceeds maximum allowed limit");
    });
  });
});
