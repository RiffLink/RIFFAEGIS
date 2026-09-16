import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getRestoreChallenge, POST as postRestoreIdentity } from "@/app/api/identity/restore/route";
import { POST as initDocHandler } from "@/app/api/documents/init/route";
import { POST as confirmUploadHandler } from "@/app/api/documents/[id]/confirm-upload/route";
import { POST as activateHandler } from "@/app/api/documents/[id]/activate/route";
import { POST as sendOtpHandler } from "@/app/api/sign/[token]/otp/send/route";
import { GET as cronUpgradeOtsHandler } from "@/app/api/cron/upgrade-ots/route";
import { PUT as mockStoragePut } from "@/app/api/mock-storage/route";
import {
  generateMlDsaKeyPair,
  signOriginalHash,
  bytesToBase64,
  generateAesKey,
  encryptPdf,
  getPublicKeyHash,
} from "@/lib/crypto";
import { generateAuditCertificatePdf } from "@/lib/server/certificate";
import { extractCertificateMetadata, verifyAgreementOffline } from "@/lib/crypto/verify-portal";
import { db } from "@/lib/server/db";

describe("Security Fixes & Reliability Test Suite", () => {
  describe("1. Zero-Knowledge Identity Restore Challenge-Response Protection", () => {
    it("should issue challenge on GET and reject invalid or missing signature on POST", async () => {
      const mlDsaKey = generateMlDsaKeyPair();
      const pubKeyBase64 = bytesToBase64(mlDsaKey.publicKey);

      // GET challenge
      const getRes = await getRestoreChallenge();
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.challenge_message).toBeDefined();
      expect(getJson.challenge_token).toBeDefined();
      expect(getJson.timestamp).toBeDefined();

      const { challenge_message, challenge_token, timestamp } = getJson;

      // POST with missing signature -> 401
      const noSigReq = new NextRequest("http://localhost:3000/api/identity/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_ml_dsa_public_key: pubKeyBase64,
          challenge_message,
          challenge_token,
          timestamp,
        }),
      });
      const noSigRes = await postRestoreIdentity(noSigReq);
      expect(noSigRes.status).toBe(401);

      // POST with forged signature -> 401
      const wrongKey = generateMlDsaKeyPair();
      const forgedSig = signOriginalHash(wrongKey.secretKey, challenge_message);
      const forgedReq = new NextRequest("http://localhost:3000/api/identity/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_ml_dsa_public_key: pubKeyBase64,
          challenge_signature: bytesToBase64(forgedSig),
          challenge_message,
          challenge_token,
          timestamp,
        }),
      });
      const forgedRes = await postRestoreIdentity(forgedReq);
      expect(forgedRes.status).toBe(401);

      // POST with valid ML-DSA-65 signature on challenge -> 200 with creator_identity_token
      const validSig = signOriginalHash(mlDsaKey.secretKey, challenge_message);
      const validReq = new NextRequest("http://localhost:3000/api/identity/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_ml_dsa_public_key: pubKeyBase64,
          challenge_signature: bytesToBase64(validSig),
          challenge_message,
          challenge_token,
          timestamp,
        }),
      });
      const validRes = await postRestoreIdentity(validReq);
      expect(validRes.status).toBe(200);
      const validJson = await validRes.json();
      expect(validJson.creator_identity_token).toBeDefined();
      expect(validJson.creator_ml_dsa_public_key_hash).toBeDefined();
    });
  });

  describe("2. Document Init Post-Quantum Signature Verification", () => {
    it("should reject document init if creator ML-DSA signature does not match original SHA3-512", async () => {
      const pdfData = new TextEncoder().encode("%PDF-1.7 Fake Contract");
      const aesKey = await generateAesKey();
      const encResult = await encryptPdf(pdfData, aesKey);

      const mlDsaKey = generateMlDsaKeyPair();
      // Sign something else
      const invalidSig = signOriginalHash(mlDsaKey.secretKey, "some-other-hash");

      const initReq = new NextRequest("http://localhost:3000/api/documents/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_sha256: encResult.originalSha256,
          original_sha3_512: encResult.originalSha3_512,
          file_size_bytes: encResult.fileSizeBytes,
          creator_email: "creator@example.com",
          creator_ml_dsa_public_key: bytesToBase64(mlDsaKey.publicKey),
          creator_ml_dsa_signature: bytesToBase64(invalidSig),
        }),
      });

      const res = await initDocHandler(initReq);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error?.message).toMatch(/ML-DSA-65 signature does not match/i);
    });
  });

  describe("3. OTP Email Spoofing Rejection", () => {
    it("should reject OTP send request if provided email differs from registered signer email", async () => {
      // 1. Create and activate a document with a signer
      const pdfData = new TextEncoder().encode("%PDF-1.7 Signer Test");
      const aesKey = await generateAesKey();
      const encResult = await encryptPdf(pdfData, aesKey);
      const mlDsaKey = generateMlDsaKeyPair();
      const mlDsaSig = signOriginalHash(mlDsaKey.secretKey, encResult.originalSha3_512);

      const initReq = new NextRequest("http://localhost:3000/api/documents/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_sha256: encResult.originalSha256,
          original_sha3_512: encResult.originalSha3_512,
          file_size_bytes: encResult.fileSizeBytes,
          creator_email: "creator@example.com",
          creator_ml_dsa_public_key: bytesToBase64(mlDsaKey.publicKey),
          creator_ml_dsa_signature: bytesToBase64(mlDsaSig),
        }),
      });
      const initRes = await initDocHandler(initReq);
      const { document_id, creator_document_token, r2_presigned_upload_url } = await initRes.json();

      // Upload encrypted file
      await mockStoragePut(
        new NextRequest(r2_presigned_upload_url, {
          method: "PUT",
          body: encResult.encryptedBytes as unknown as BodyInit,
        })
      );

      // Confirm upload
      const confRes = await confirmUploadHandler(
        new NextRequest(`http://localhost:3000/api/documents/${document_id}/confirm-upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${creator_document_token}`,
          },
          body: JSON.stringify({ r2_storage_path: `documents/${document_id}/original.enc` }),
        }),
        { params: Promise.resolve({ id: document_id }) }
      );
      expect(confRes.status).toBe(200);

      // Activate document
      const actRes = await activateHandler(
        new NextRequest(`http://localhost:3000/api/documents/${document_id}/activate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${creator_document_token}`,
          },
          body: JSON.stringify({
            keystore_backup_confirmed: true,
            signers: [
              { email: "legit-signer@example.com", auth_level: "EMAIL_OTP", role: "Signer 1" },
            ],
          }),
        }),
        { params: Promise.resolve({ id: document_id }) }
      );
      expect(actRes.status).toBe(200);
      const actJson = await actRes.json();
      const signerToken = actJson.first_signer_token;
      expect(signerToken).toBeDefined();

      // 2. Attacker attempts to send OTP to attacker@evil.com
      const spoofOtpReq = new NextRequest(
        `http://localhost:3000/api/sign/${signerToken}/otp/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "attacker@evil.com" }),
        }
      );
      const spoofRes = await sendOtpHandler(spoofOtpReq, {
        params: Promise.resolve({ token: signerToken }),
      });

      expect(spoofRes.status).toBe(403);
      const spoofJson = await spoofRes.json();
      expect(spoofJson.error?.code).toBe("EMAIL_MISMATCH");
    });
  });

  describe("4. Activation Idempotency & Token Preservation", () => {
    it("should return existing token without recreating signers on subsequent activate calls", async () => {
      const pdfData = new TextEncoder().encode("%PDF-1.7 Idempotent Test");
      const aesKey = await generateAesKey();
      const encResult = await encryptPdf(pdfData, aesKey);
      const mlDsaKey = generateMlDsaKeyPair();
      const mlDsaSig = signOriginalHash(mlDsaKey.secretKey, encResult.originalSha3_512);

      const initRes = await initDocHandler(
        new NextRequest("http://localhost:3000/api/documents/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original_sha256: encResult.originalSha256,
            original_sha3_512: encResult.originalSha3_512,
            file_size_bytes: encResult.fileSizeBytes,
            creator_email: "creator@example.com",
            creator_ml_dsa_public_key: bytesToBase64(mlDsaKey.publicKey),
            creator_ml_dsa_signature: bytesToBase64(mlDsaSig),
          }),
        })
      );
      const { document_id, creator_document_token, r2_presigned_upload_url } = await initRes.json();

      // Upload encrypted file
      await mockStoragePut(
        new NextRequest(r2_presigned_upload_url, {
          method: "PUT",
          body: encResult.encryptedBytes as unknown as BodyInit,
        })
      );

      // Confirm upload
      const confRes = await confirmUploadHandler(
        new NextRequest(`http://localhost:3000/api/documents/${document_id}/confirm-upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${creator_document_token}`,
          },
          body: JSON.stringify({ r2_storage_path: `documents/${document_id}/original.enc` }),
        }),
        { params: Promise.resolve({ id: document_id }) }
      );
      expect(confRes.status).toBe(200);

      // First Activation
      const actRes1 = await activateHandler(
        new NextRequest(`http://localhost:3000/api/documents/${document_id}/activate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${creator_document_token}`,
          },
          body: JSON.stringify({
            keystore_backup_confirmed: true,
            signers: [
              { email: "alice@example.com", auth_level: "PASSKEY", role: "Party A" },
              { email: "bob@example.com", auth_level: "PASSKEY", role: "Party B" },
            ],
          }),
        }),
        { params: Promise.resolve({ id: document_id }) }
      );
      expect(actRes1.status).toBe(200);
      const json1 = await actRes1.json();
      const token1 = json1.first_signer_token;
      expect(token1).toBeDefined();

      // Second Activation (e.g. user reloads /new/share page)
      const actRes2 = await activateHandler(
        new NextRequest(`http://localhost:3000/api/documents/${document_id}/activate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${creator_document_token}`,
          },
          body: JSON.stringify({
            keystore_backup_confirmed: true,
            signers: [
              { email: "alice@example.com", auth_level: "PASSKEY", role: "Party A" },
            ],
          }),
        }),
        { params: Promise.resolve({ id: document_id }) }
      );
      expect(actRes2.status).toBe(200);
      const json2 = await actRes2.json();

      // Tokens and signer integrity must be preserved
      expect(json2.first_signer_token).toEqual(token1);
      const signers = await db.listSignersByDocument(document_id);
      expect(signers.length).toBe(2); // Still 2 signers, not wiped or duplicated
    });
  });

  describe("5. Machine-Readable Audit Certificate & Standalone Portal Verification", () => {
    it("should embed machine-readable metadata in certificate and pass all 5 verification points", async () => {
      const pdfData = new TextEncoder().encode("%PDF-1.7 Audit Certificate Test PDF");
      const aesKey = await generateAesKey();
      const encResult = await encryptPdf(pdfData, aesKey);
      const mlDsaKey = generateMlDsaKeyPair();
      const mlDsaSig = signOriginalHash(mlDsaKey.secretKey, encResult.originalSha3_512);

      const mockDoc = {
        id: "doc-test-audit-001",
        creator_email: "creator@example.com",
        original_sha256: encResult.originalSha256,
        original_sha3_512: encResult.originalSha3_512,
        creator_ml_dsa_public_key: bytesToBase64(mlDsaKey.publicKey),
        creator_ml_dsa_public_key_hash: getPublicKeyHash(mlDsaKey.publicKey),
        creator_ml_dsa_signature: bytesToBase64(mlDsaSig),
        final_merkle_root: "merkle-root-abc-123",
        status: "COMPLETED" as const,
        file_size_bytes: encResult.fileSizeBytes,
        created_at: new Date().toISOString(),
      };

      const mockSigner = {
        id: "signer-test-001",
        document_id: mockDoc.id,
        email: "signer@example.com",
        role: "Contractor",
        step_number: 1,
        status: "SIGNED" as const,
        auth_level: "PASSKEY" as const,
        signed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const mockLogs = [
        {
          id: "log-1",
          document_id: mockDoc.id,
          event_type: "DOCUMENT_INITIATED",
          details: {},
          payload_json: {},
          created_at: new Date().toISOString(),
          current_log_hash: "leaf-1-hash",
        },
        {
          id: "log-2",
          document_id: mockDoc.id,
          event_type: "DOCUMENT_FINALIZED",
          details: {},
          payload_json: {},
          created_at: new Date().toISOString(),
          current_log_hash: "leaf-2-hash",
        },
      ];

      const mockAtomicTime = {
        str: 1710570000,
        isoTime: new Date().toISOString(),
        rttMs: 12,
        verified: true,
      };

      // Generate certificate PDF
      const certBytes = await generateAuditCertificatePdf({
        document: mockDoc as unknown as import("@/lib/server/types").DocumentRecord,
        signer: mockSigner as unknown as import("@/lib/server/types").SignerRecord,
        auditLogs: mockLogs as unknown as import("@/lib/server/types").AuditLogRecord[],
        atomicTime: {
          isoTime: new Date().toISOString(),
          source: "NICT_HTTPS",
          roundTripMs: 12,
        },
      });
      expect(certBytes.byteLength).toBeGreaterThan(1000);

      // Extract metadata from certificate PDF
      const extracted = await extractCertificateMetadata(certBytes);
      expect(extracted).not.toBeNull();
      expect(extracted?.documentId).toEqual(mockDoc.id);
      expect(extracted?.originalSha256).toEqual(mockDoc.original_sha256);
      expect(extracted?.originalSha3_512).toEqual(mockDoc.original_sha3_512);
      expect(extracted?.creatorPublicKeyBase64).toEqual(mockDoc.creator_ml_dsa_public_key);
      expect(extracted?.creatorSignatureBase64).toEqual(mockDoc.creator_ml_dsa_signature);
      expect(extracted?.finalMerkleRoot).toEqual(mockDoc.final_merkle_root);

      // Verify original agreement using extracted certificate metadata
      const report = verifyAgreementOffline({
        originalPdfBytes: pdfData,
        certificatePdfBytes: certBytes,
        expectedSha256: extracted?.originalSha256,
        expectedSha3_512: extracted?.originalSha3_512,
        creatorPublicKeyBase64: extracted?.creatorPublicKeyBase64,
        creatorSignatureBase64: extracted?.creatorSignatureBase64,
        finalMerkleRoot: extracted?.finalMerkleRoot,
      });

      expect(report.isAuthentic).toBe(true);
      expect(report.checks.find((c) => c.id === "sha256")?.status).toBe("PASSED");
      expect(report.checks.find((c) => c.id === "sha3_512")?.status).toBe("PASSED");
      expect(report.checks.find((c) => c.id === "mldsa65")?.status).toBe("PASSED");
      expect(report.checks.find((c) => c.id === "merkle_root")?.status).toBe("PASSED");
    });
  });

  describe("6. OpenTimestamps Cron Execution", () => {
    it("should safely scan pending documents without error", async () => {
      const cronReq = new NextRequest("http://localhost:3000/api/cron/upgrade-ots", {
        method: "GET",
      });
      const cronRes = await cronUpgradeOtsHandler(cronReq);
      expect(cronRes.status).toBe(200);
      const cronJson = await cronRes.json();
      expect(cronJson.success).toBe(true);
      expect(typeof cronJson.scanned).toBe("number");
      expect(typeof cronJson.upgraded).toBe("number");
    });
  });
});
