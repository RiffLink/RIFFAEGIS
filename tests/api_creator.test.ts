import { describe, it, expect } from "vitest";
import { POST as initHandler } from "@/app/api/documents/init/route";
import { POST as confirmUploadHandler } from "@/app/api/documents/[id]/confirm-upload/route";
import { POST as registerChallengeHandler } from "@/app/api/documents/[id]/webauthn/register-challenge/route";
import { POST as registerCompleteHandler } from "@/app/api/documents/[id]/webauthn/register-complete/route";
import { POST as activateHandler } from "@/app/api/documents/[id]/activate/route";
import { GET as listDocsHandler } from "@/app/api/documents/route";
import { GET as getDocHandler, DELETE as deleteDocHandler } from "@/app/api/documents/[id]/route";
import { POST as cancelHandler } from "@/app/api/documents/[id]/cancel/route";
import { PUT as mockStoragePut } from "@/app/api/mock-storage/route";
import { NextRequest } from "next/server";
import {
  generateAesKey,
  encryptPdf,
  generateMlDsaKeyPair,
  signOriginalHash,
  bytesToBase64,
} from "@/lib/crypto";

describe("Creator Flow (甲) End-to-End API Suite", () => {
  it("should complete the full creator lifecycle: init -> upload -> webauthn -> activate -> list -> cancel", async () => {
    // 1. Prepare PDF and cryptographic artifacts
    const pdfData = new TextEncoder().encode("%PDF-1.7\nSample Contract for Testing.");
    const aesKey = await generateAesKey();
    const encResult = await encryptPdf(pdfData, aesKey);

    const mlDsaKey = generateMlDsaKeyPair();
    const mlDsaSig = signOriginalHash(mlDsaKey.secretKey, encResult.originalSha3_512);

    // 2. Call POST /api/documents/init
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

    const initRes = await initHandler(initReq);
    expect(initRes.status).toEqual(201);
    const initJson = await initRes.json();

    expect(initJson.document_id).toBeDefined();
    expect(initJson.creator_document_token).toBeDefined();
    expect(initJson.creator_identity_token).toBeDefined();
    expect(initJson.r2_presigned_upload_url).toBeDefined();

    const docId = initJson.document_id;
    const docToken = initJson.creator_document_token;
    const idToken = initJson.creator_identity_token;

    // 3. Perform Direct Storage Upload (Mock Storage PUT)
    const storageReq = new NextRequest(initJson.r2_presigned_upload_url, {
      method: "PUT",
      body: encResult.encryptedBytes as unknown as BodyInit,
      headers: { "Content-Type": "application/octet-stream" },
    });
    const storageRes = await mockStoragePut(storageReq);
    expect(storageRes.status).toEqual(200);

    // 4. Call POST /api/documents/[id]/confirm-upload
    const confirmReq = new NextRequest(`http://localhost:3000/api/documents/${docId}/confirm-upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${docToken}`,
        "Content-Type": "application/json",
      },
    });
    const confirmRes = await confirmUploadHandler(confirmReq, {
      params: Promise.resolve({ id: docId }),
    });
    expect(confirmRes.status).toEqual(200);
    const confirmJson = await confirmRes.json();
    expect(confirmJson.upload_confirmed).toBe(true);

    // 5. Call WebAuthn register-challenge
    const challengeReq = new NextRequest(`http://localhost:3000/api/documents/${docId}/webauthn/register-challenge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${docToken}` },
    });
    const challengeRes = await registerChallengeHandler(challengeReq, {
      params: Promise.resolve({ id: docId }),
    });
    expect(challengeRes.status).toEqual(200);
    const challengeJson = await challengeRes.json();
    expect(challengeJson.challenge).toBeDefined();

    // 6. Call WebAuthn register-complete (mock mode)
    const completeReq = new NextRequest(`http://localhost:3000/api/documents/${docId}/webauthn/register-complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${docToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mock: true }),
    });
    const completeRes = await registerCompleteHandler(completeReq, {
      params: Promise.resolve({ id: docId }),
    });
    expect(completeRes.status).toEqual(200);

    // 7. Call POST /api/documents/[id]/activate (requires keystore_backup_confirmed)
    const activateReq = new NextRequest(`http://localhost:3000/api/documents/${docId}/activate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${docToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keystore_backup_confirmed: true,
        signer_email: "signer@partner.org",
      }),
    });
    const activateRes = await activateHandler(activateReq, {
      params: Promise.resolve({ id: docId }),
    });
    expect(activateRes.status).toEqual(200);
    const activateJson = await activateRes.json();

    expect(activateJson.status).toEqual("pending");
    expect(activateJson.signing_token).toBeDefined();
    expect(activateJson.signing_url_template).toContain("/sign/");

    // 8. List documents via GET /api/documents
    const listReq = new NextRequest("http://localhost:3000/api/documents", {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const listRes = await listDocsHandler(listReq);
    expect(listRes.status).toEqual(200);
    const listJson = await listRes.json();
    expect(listJson.documents.some((d: any) => d.id === docId)).toBe(true);

    // 9. Inspect document details via GET /api/documents/[id]
    const getReq = new NextRequest(`http://localhost:3000/api/documents/${docId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const getRes = await getDocHandler(getReq, {
      params: Promise.resolve({ id: docId }),
    });
    expect(getRes.status).toEqual(200);
    const getJson = await getRes.json();
    expect(getJson.document.status).toEqual("pending");
    expect(getJson.auditLogs.length).toBeGreaterThanOrEqual(1);

    // 10. Cancel document via POST /api/documents/[id]/cancel
    const cancelReq = new NextRequest(`http://localhost:3000/api/documents/${docId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${docToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "Testing cancellation flow" }),
    });
    const cancelRes = await cancelHandler(cancelReq, {
      params: Promise.resolve({ id: docId }),
    });
    expect(cancelRes.status).toEqual(200);
    const cancelJson = await cancelRes.json();
    expect(cancelJson.status).toEqual("cancelled");

    // 11. Delete document and storage files via DELETE /api/documents/[id]
    const deleteReq = new NextRequest(`http://localhost:3000/api/documents/${docId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const deleteRes = await deleteDocHandler(deleteReq, {
      params: Promise.resolve({ id: docId }),
    });
    expect(deleteRes.status).toEqual(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.success).toBe(true);

    // Verify it is gone
    const verifyGet = await getDocHandler(getReq, {
      params: Promise.resolve({ id: docId }),
    });
    expect(verifyGet.status).toEqual(404);
  });
});
