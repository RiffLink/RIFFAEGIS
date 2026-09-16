import { describe, it, expect } from "vitest";
import { POST as initHandler } from "@/app/api/documents/init/route";
import { POST as confirmUploadHandler } from "@/app/api/documents/[id]/confirm-upload/route";
import { POST as activateHandler } from "@/app/api/documents/[id]/activate/route";
import { GET as signInfoHandler } from "@/app/api/sign/[token]/info/route";
import { POST as sendOtpHandler } from "@/app/api/sign/[token]/otp/send/route";
import { POST as verifyOtpHandler } from "@/app/api/sign/[token]/otp/verify/route";
import { POST as signerChallengeHandler } from "@/app/api/sign/[token]/webauthn/challenge/route";
import { POST as signerConsentHandler } from "@/app/api/sign/[token]/consent/route";
import { GET as docStatusHandler } from "@/app/api/documents/[id]/status/route";
import { GET as getCertHandler } from "@/app/api/documents/[id]/certificate/route";
import { PUT as mockStoragePut, GET as mockStorageGet } from "@/app/api/mock-storage/route";
import { finalizeDocument } from "@/lib/server/finalize";
import { NextRequest } from "next/server";
import {
  generateAesKey,
  encryptPdf,
  decryptPdfAndVerify,
  generateMlDsaKeyPair,
  signOriginalHash,
  bytesToBase64,
  hasPdfMagicBytes,
} from "@/lib/crypto";

describe("Signer Flow (乙) & Background Finalization Engine Suite", () => {
  it("should execute full signer lifecycle through to certificate generation and delivery", async () => {
    // 1. Creator creates and activates document
    const originalPdf = new TextEncoder().encode("%PDF-1.7\nMutual Non-Disclosure Agreement 2026.");
    const aesKey = await generateAesKey();
    const encResult = await encryptPdf(originalPdf, aesKey);

    const mlDsaKey = generateMlDsaKeyPair();
    const mlDsaSig = signOriginalHash(mlDsaKey.secretKey, encResult.originalSha3_512);

    const initReq = new NextRequest("http://localhost:3000/api/documents/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        original_sha256: encResult.originalSha256,
        original_sha3_512: encResult.originalSha3_512,
        file_size_bytes: encResult.fileSizeBytes,
        creator_email: "creator@acme.corp",
        creator_ml_dsa_public_key: bytesToBase64(mlDsaKey.publicKey),
        creator_ml_dsa_signature: bytesToBase64(mlDsaSig),
      }),
    });
    const initRes = await initHandler(initReq);
    const { document_id: docId, creator_document_token: docToken, r2_presigned_upload_url: uploadUrl } = await initRes.json();

    // Upload encrypted binary directly
    await mockStoragePut(new NextRequest(uploadUrl, {
      method: "PUT",
      body: encResult.encryptedBytes as unknown as BodyInit,
    }));

    // Confirm upload
    await confirmUploadHandler(new NextRequest(`http://localhost:3000/api/documents/${docId}/confirm-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${docToken}` },
    }), { params: Promise.resolve({ id: docId }) });

    // Activate document -> get signing token
    const activateRes = await activateHandler(new NextRequest(`http://localhost:3000/api/documents/${docId}/activate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${docToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keystore_backup_confirmed: true,
        signer_email: "signer@partner.org",
      }),
    }), { params: Promise.resolve({ id: docId }) });

    const { signing_token: token } = await activateRes.json();
    expect(token).toBeDefined();

    // 2. Signer Flow: Step 1 - GET /api/sign/[token]/info
    const infoRes = await signInfoHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/info`), {
      params: Promise.resolve({ token }),
    });
    expect(infoRes.status).toEqual(200);
    const infoJson = await infoRes.json();
    expect(infoJson.original_sha256).toEqual(encResult.originalSha256);
    expect(infoJson.r2_presigned_download_url).toBeUndefined(); // Security check: no download url before OTP!

    // 3. Signer Flow: Request OTP
    const sendOtpRes = await sendOtpHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "signer@partner.org" }),
    }), { params: Promise.resolve({ token }) });
    expect(sendOtpRes.status).toEqual(200);
    const { debug_otp: otpCode } = await sendOtpRes.json();
    expect(otpCode).toBeDefined();

    // 4. Signer Flow: Verify OTP
    const verifyOtpRes = await verifyOtpHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp_code: otpCode }),
    }), { params: Promise.resolve({ token }) });
    expect(verifyOtpRes.status).toEqual(200);
    const { signer_session_token: signerJwt, r2_presigned_download_url: downloadUrl } = await verifyOtpRes.json();
    expect(signerJwt).toBeDefined();
    expect(downloadUrl).toBeDefined();

    // 5. Signer downloads encrypted PDF & verifies integrity
    const downloadRes = await mockStorageGet(new NextRequest(downloadUrl));
    expect(downloadRes.status).toEqual(200);
    const downloadedEncryptedBytes = new Uint8Array(await downloadRes.arrayBuffer());

    // Decrypt using AES key & assert SHA-256 matches
    const decryptedPdf = await decryptPdfAndVerify(downloadedEncryptedBytes, aesKey, encResult.originalSha256);
    expect(new TextDecoder().decode(decryptedPdf)).toEqual(new TextDecoder().decode(originalPdf));

    // 6. Signer WebAuthn Challenge
    const challengeRes = await signerChallengeHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/webauthn/challenge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signerJwt}` },
    }), { params: Promise.resolve({ token }) });
    expect(challengeRes.status).toEqual(200);
    const challengeJson = await challengeRes.json();
    expect(challengeJson.challenge).toBeDefined();

    // 7. Signer Consents with Hardware Key
    const consentRes = await signerConsentHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/consent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${signerJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_level: "high_webauthn",
        mock: true,
      }),
    }), { params: Promise.resolve({ token }) });
    expect(consentRes.status).toEqual(200);
    const consentJson = await consentRes.json();
    expect(consentJson.accepted).toBe(true);
    expect(consentJson.status).toEqual("consent_received");
    expect(consentJson.final_merkle_root).toBeDefined();

    // 8. Execute Background Finalization Pipeline
    await finalizeDocument(docId);

    // 9. Check Status -> auth required (401 without token, 403 with wrong token, 200 with signer token or jwt)
    const unauthorizedStatusRes = await docStatusHandler(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/status`),
      { params: Promise.resolve({ id: docId }) }
    );
    expect(unauthorizedStatusRes.status).toEqual(401);

    const forbiddenStatusRes = await docStatusHandler(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/status`, {
        headers: { Authorization: "Bearer invalid-token-xyz" },
      }),
      { params: Promise.resolve({ id: docId }) }
    );
    expect(forbiddenStatusRes.status).toEqual(403);

    // Valid status check with signer JWT
    const statusRes = await docStatusHandler(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/status`, {
        headers: { Authorization: `Bearer ${signerJwt}` },
      }),
      { params: Promise.resolve({ id: docId }) }
    );
    expect(statusRes.status).toEqual(200);
    const statusJson = await statusRes.json();
    expect(statusJson.status).toEqual("completed");
    expect(statusJson.certificate_ready).toBe(true);

    // Valid status check with raw signing token
    const tokenStatusRes = await docStatusHandler(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/status?token=${token}`),
      { params: Promise.resolve({ id: docId }) }
    );
    expect(tokenStatusRes.status).toEqual(200);

    // 10. Fetch Certificate PDF download URL
    const certUrlRes = await getCertHandler(new NextRequest(`http://localhost:3000/api/documents/${docId}/certificate`, {
      headers: { Authorization: `Bearer ${signerJwt}` },
    }), { params: Promise.resolve({ id: docId }) });
    expect(certUrlRes.status).toEqual(200);
    const { certificate_pdf_presigned_url: certDownloadUrl } = await certUrlRes.json();
    expect(certDownloadUrl).toBeDefined();

    // 11. Download and verify generated certificate PDF binary
    const certDownloadRes = await mockStorageGet(new NextRequest(certDownloadUrl));
    expect(certDownloadRes.status).toEqual(200);
    const certPdfBytes = new Uint8Array(await certDownloadRes.arrayBuffer());

    // Validate that certificate is a valid PDF
    expect(hasPdfMagicBytes(certPdfBytes)).toBe(true);
    expect(certPdfBytes.byteLength).toBeGreaterThan(1000);
  });
});
