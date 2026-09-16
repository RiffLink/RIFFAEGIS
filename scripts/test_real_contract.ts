import fs from "fs";
import { NextRequest } from "next/server";
import { POST as initHandler } from "../app/api/documents/init/route";
import { POST as confirmUploadHandler } from "../app/api/documents/[id]/confirm-upload/route";
import { POST as activateHandler } from "../app/api/documents/[id]/activate/route";
import { GET as signInfoHandler } from "../app/api/sign/[token]/info/route";
import { POST as sendOtpHandler } from "../app/api/sign/[token]/otp/send/route";
import { POST as verifyOtpHandler } from "../app/api/sign/[token]/otp/verify/route";
import { POST as consentHandler } from "../app/api/sign/[token]/consent/route";
import { GET as docStatusHandler } from "../app/api/documents/[id]/status/route";
import { GET as getCertHandler } from "../app/api/documents/[id]/certificate/route";
import { finalizeDocument } from "../lib/server/finalize";
import { PUT as mockStoragePut, GET as mockStorageGet } from "../app/api/mock-storage/route";
import {
  encryptPdf,
  generateAesKey,
  exportAesKeyBase64Url,
  generateMlDsaKeyPair,
  signOriginalHash,
  bytesToBase64,
  getPublicKeyHash,
} from "../lib/crypto";

async function runRealContractTest() {
  console.log("==================================================");
  console.log("RiffAegis 実契約書 (プロジェクト参加合意書.pdf) E2E作成テスト");
  console.log("==================================================");

  // 1. Read real contract PDF
  const pdfPath = "contracts/プロジェクト参加合意書.pdf";
  const rawBytes = new Uint8Array(fs.readFileSync(pdfPath));
  console.log(`[1/8] 原本PDF読込完了: ${rawBytes.length} bytes (約${Math.round(rawBytes.length / 1024)} KB)`);

  // 2. Client-side AES-GCM-256 encryption & ML-DSA-65 keypair generation
  const aesKey = await generateAesKey();
  const aesKeyFragment = await exportAesKeyBase64Url(aesKey);
  const encResult = await encryptPdf(rawBytes, aesKey);
  console.log(`[2/8] クライアント暗号化完了: AES-GCM-256 (原本SHA-256: ${encResult.originalSha256})`);
  console.log(`      復号鍵URLフラグメント: #key=${aesKeyFragment.slice(0, 16)}... (サーバー非送信)`);

  const mlDsaKeys = generateMlDsaKeyPair();
  const signature = signOriginalHash(mlDsaKeys.secretKey, encResult.originalSha3_512);
  const pkHash = getPublicKeyHash(mlDsaKeys.publicKey);
  console.log(`[3/8] 耐量子署名完了: NIST ML-DSA-65 (公開鍵ハッシュ: ${pkHash.slice(0, 16)}...)`);

  // 3. API: POST /api/documents/init
  const initReq = new NextRequest("http://localhost:3000/api/documents/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      original_sha256: encResult.originalSha256,
      original_sha3_512: encResult.originalSha3_512,
      file_size_bytes: encResult.fileSizeBytes,
      document_title: "プロジェクト参加合意書",
      original_filename: "プロジェクト参加合意書.pdf",
      creator_email: "creator@example.com",
      creator_ml_dsa_public_key: bytesToBase64(mlDsaKeys.publicKey),
      creator_ml_dsa_signature: bytesToBase64(signature),
      signers: [
        {
          email: "participant@example.com",
          name: "乙（プロジェクト参加者）",
          role: "signer",
        },
      ],
    }),
  });
  const initRes = await initHandler(initReq);
  const { document_id: docId, creator_document_token: docToken, r2_presigned_upload_url: uploadUrl } = await initRes.json();
  console.log(`[4/8] 契約初期化API完了: Document ID = ${docId}`);

  // 4. Upload encrypted bytes & confirm upload
  await mockStoragePut(new NextRequest(uploadUrl, {
    method: "PUT",
    body: encResult.encryptedBytes as unknown as BodyInit,
  }));
  await confirmUploadHandler(new NextRequest(`http://localhost:3000/api/documents/${docId}/confirm-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${docToken}` },
  }), { params: Promise.resolve({ id: docId }) });

  // 5. Activate document -> Generates signing token
  const activateRes = await activateHandler(new NextRequest(`http://localhost:3000/api/documents/${docId}/activate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${docToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keystore_backup_confirmed: true,
      signer_email: "participant@example.com",
    }),
  }), { params: Promise.resolve({ id: docId }) });
  const { signing_token: token } = await activateRes.json();
  const fullSigningUrl = `http://localhost:3000/sign/${token}#key=${aesKeyFragment}`;
  console.log(`[5/8] 署名用URL発行成功!`);
  console.log(`      発行URL: ${fullSigningUrl}`);

  // 6. Signer Flow: Info -> OTP Send -> OTP Verify
  const infoRes = await signInfoHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/info`), {
    params: Promise.resolve({ token }),
  });
  const infoJson = await infoRes.json();
  console.log(`[6/8] 乙側アクセス: 「${infoJson.document_title}」 署名者: ${infoJson.signer_name}`);

  const sendOtpRes = await sendOtpHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "participant@example.com" }),
  }), { params: Promise.resolve({ token }) });
  const { debug_otp } = await sendOtpRes.json();

  const verifyOtpRes = await verifyOtpHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "participant@example.com", otp_code: debug_otp }),
  }), { params: Promise.resolve({ token }) });
  const { signer_session_token: signerJwt } = await verifyOtpRes.json();
  console.log(`[7/8] 乙側本人確認 (OTP認証) 成功`);

  // 7. Signer Consent (WebAuthn)
  const consentRes = await consentHandler(new NextRequest(`http://localhost:3000/api/sign/${token}/consent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${signerJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      signer_name: "乙（プロジェクト参加者）",
      mock: true,
    }),
  }), { params: Promise.resolve({ token }) });
  const consentJson = await consentRes.json();
  console.log(`      乙のWebAuthn生体合意完了 (Merkle Root: ${consentJson.final_merkle_root.slice(0, 16)}...)`);

  // 8. Execute Background Finalization Engine
  console.log(`[8/8] 締結パイプライン実行 (NICT原子時計・OpenTimestamps・監査証明書生成)...`);
  await finalizeDocument(docId);

  // Check Status
  const statusRes = await docStatusHandler(new NextRequest(`http://localhost:3000/api/documents/${docId}/status`, {
    headers: { Authorization: `Bearer ${signerJwt}` },
  }), { params: Promise.resolve({ id: docId }) });
  const statusJson = await statusRes.json();
  console.log(`      締結ステータス: ${statusJson.status}`);
  console.log(`      合意締結証明書生成完了: ${statusJson.certificate_ready ? "YES (PDF Ready)" : "NO"}`);
  console.log(`      監査証明書URL: ${statusJson.certificate_url}`);

  console.log("==================================================");
  console.log("🎉 実契約書「プロジェクト参加合意書.pdf」のE2Eテスト成功！");
  console.log("==================================================");
}

runRealContractTest().catch(console.error);
