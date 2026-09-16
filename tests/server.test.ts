import { describe, it, expect } from "vitest";
import {
  signCreatorDocumentToken,
  signCreatorIdentityToken,
  signSignerSessionToken,
  verifyToken,
  CreatorDocumentTokenClaims,
  CreatorIdentityTokenClaims,
  SignerSessionTokenClaims,
} from "@/lib/server/jwt";
import { db } from "@/lib/server/db";
import { appendAuditLog, getLatestMerkleRoot } from "@/lib/server/merkle";
import { genesisHash } from "@/lib/crypto/hashes";

describe("Server Core Infrastructure Suite", () => {
  describe("JWT Scoped Tokens", () => {
    it("should issue and verify creator document token", async () => {
      const docId = "550e8400-e29b-41d4-a716-446655440000";
      const keyHash = "a".repeat(64);

      const token = await signCreatorDocumentToken(docId, keyHash);
      const claims = await verifyToken<CreatorDocumentTokenClaims>(token);

      expect(claims.sub).toEqual(`creator:doc:${docId}`);
      expect(claims.document_id).toEqual(docId);
      expect(claims.ml_dsa_public_key_hash).toEqual(keyHash);
      expect(claims.role).toEqual("creator");
    });

    it("should issue and verify creator identity token", async () => {
      const keyHash = "b".repeat(64);

      const token = await signCreatorIdentityToken(keyHash);
      const claims = await verifyToken<CreatorIdentityTokenClaims>(token);

      expect(claims.sub).toEqual(`creator:id:${keyHash}`);
      expect(claims.ml_dsa_public_key_hash).toEqual(keyHash);
      expect(claims.role).toEqual("creator_admin");
    });

    it("should issue and verify signer session token with 3h expiration claim", async () => {
      const docId = "550e8400-e29b-41d4-a716-446655440000";
      const signerId = "signer-uuid-111";
      const email = "signer@example.com";
      const signToken = "one-time-token-xyz";

      const jwt = await signSignerSessionToken(docId, signerId, email, signToken);
      const claims = await verifyToken<SignerSessionTokenClaims>(jwt);

      expect(claims.sub).toEqual(`signer:${signToken}`);
      expect(claims.document_id).toEqual(docId);
      expect(claims.signer_id).toEqual(signerId);
      expect(claims.email_verified).toEqual(email);
      expect(claims.role).toEqual("signer");
      expect(claims.exp! - claims.iat!).toEqual(3 * 3600);
    });
  });

  describe("Database & Merkle Tree Operations", () => {
    it("should perform document CRUD and Merkle chain auditing", async () => {
      const docId = "doc-test-merkle-1";
      const originalSha256 = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const keyHash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      // 1. Initial Genesis Check
      const initialRoot = await getLatestMerkleRoot(docId);
      expect(initialRoot).toEqual(genesisHash(docId));

      // 2. Insert Document
      const created = await db.insertDocument({
        id: docId,
        original_sha256: originalSha256,
        original_sha3_512: "sha3_hash",
        file_size_bytes: 1024,
        creator_ml_dsa_public_key: new Uint8Array(1952),
        creator_ml_dsa_public_key_hash: keyHash,
        creator_ml_dsa_signature: new Uint8Array(3309),
        upload_confirmed: false,
        status: "initialized",
        ots_status: "pending",
        retry_count: 0,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      expect(created.id).toEqual(docId);

      // 3. Append Audit Log: CREATED
      const log1 = await appendAuditLog(docId, "CREATED", { ip: "127.0.0.1", ua: "TestBrowser" });
      expect(log1.previous_log_hash).toEqual(genesisHash(docId));
      expect(log1.current_log_hash).toHaveLength(128);

      // 4. Append Audit Log: IDENTITY_VERIFIED
      const log2 = await appendAuditLog(docId, "IDENTITY_VERIFIED", { email: "signer@example.com" });
      expect(log2.previous_log_hash).toEqual(log1.current_log_hash);
      expect(log2.current_log_hash).toHaveLength(128);

      // 5. Append Audit Log: WEBAUTHN_CONSENT
      const log3 = await appendAuditLog(docId, "WEBAUTHN_CONSENT", { authLevel: "high_webauthn" });
      expect(log3.previous_log_hash).toEqual(log2.current_log_hash);

      // 6. Latest Merkle Root is log3's current_log_hash
      const currentRoot = await getLatestMerkleRoot(docId);
      expect(currentRoot).toEqual(log3.current_log_hash);
    });

    it("should store and retrieve idempotency keys", async () => {
      const key = "test-idempotency-key-uuid";
      const endpoint = "/api/documents/init";
      const payload = { document_id: "doc-123" };

      await db.saveIdempotencyKey(key, endpoint, 201, payload);
      const retrieved = await db.getIdempotencyKey(key);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.status).toEqual(201);
      expect(retrieved?.body).toEqual(payload);
    });
  });
});
