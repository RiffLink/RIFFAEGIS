import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import {
  signCreatorDocumentToken,
  signCreatorIdentityToken,
} from "@/lib/server/jwt";
import { appendAuditLog } from "@/lib/server/merkle";
import { getPublicKeyHash, verifyOriginalSignature } from "@/lib/crypto/mldsa";
import {
  checkIdempotency,
  getIdempotencyKeyFromRequest,
  recordIdempotency,
} from "@/lib/server/idempotency";
import { MAX_PDF_SIZE_BYTES } from "@/lib/crypto/pdf-validator";
import { base64ToBytes } from "@/lib/crypto/hashes";

export async function POST(request: NextRequest) {
  const idempotencyKey = getIdempotencyKeyFromRequest(request);
  const cachedResponse = await checkIdempotency(idempotencyKey);
  if (cachedResponse) return cachedResponse;

  try {
    const body = await request.json();
    const {
      original_sha256,
      original_sha3_512,
      file_size_bytes,
      creator_email,
      creator_ml_dsa_public_key, // base64 string
      creator_ml_dsa_signature,  // base64 string
      document_title,
      original_filename,
    } = body;

    // Validation
    if (!original_sha256 || !original_sha3_512 || !file_size_bytes) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Missing document hash or file size." } },
        { status: 400 }
      );
    }

    if (file_size_bytes > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        { error: { code: "FILE_TOO_LARGE", message: "File size exceeds 20MB limit." } },
        { status: 400 }
      );
    }

    if (!creator_ml_dsa_public_key || !creator_ml_dsa_signature) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Missing ML-DSA-65 public key or signature." } },
        { status: 400 }
      );
    }

    const pkBytes = base64ToBytes(creator_ml_dsa_public_key);
    const sigBytes = base64ToBytes(creator_ml_dsa_signature);

    // Cryptographic validation: verify ML-DSA-65 signature over original SHA3-512
    const isValidSig = verifyOriginalSignature(sigBytes, original_sha3_512, pkBytes);
    if (!isValidSig) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_SIGNATURE",
            message: "ML-DSA-65 signature does not match the document SHA3-512 hash or public key.",
          },
        },
        { status: 400 }
      );
    }

    const pkHash = getPublicKeyHash(pkBytes);

    const documentId = crypto.randomUUID();
    const encryptedOriginalPath = `documents/${documentId}/original.enc`;

    // 1. Generate Presigned Upload URL for direct client-to-R2 upload
    const presignedUploadUrl = await storage.getPresignedUploadUrl(
      encryptedOriginalPath,
      "application/octet-stream",
      900 // 15 mins
    );

    // 2. Issue scoped tokens
    const creatorDocumentToken = await signCreatorDocumentToken(documentId, pkHash);
    const creatorIdentityToken = await signCreatorIdentityToken(pkHash);

    // 3. Persist document record with status: initialized
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

    await db.insertDocument({
      id: documentId,
      encrypted_original_path: encryptedOriginalPath,
      certificate_pdf_path: null,
      original_sha256,
      original_sha3_512,
      file_size_bytes,
      final_merkle_root: null,
      creator_ml_dsa_public_key: pkBytes,
      creator_ml_dsa_public_key_hash: pkHash,
      creator_ml_dsa_signature: sigBytes,
      creator_webauthn_binding: {
        document_title: document_title || (original_filename ? original_filename.replace(/\.pdf$/i, "") : "電子契約書"),
        original_filename: original_filename || null,
      },
      upload_confirmed: false,
      status: "initialized",
      rejection_reason: null,
      cancellation_reason: null,
      ots_proof_path: null,
      ots_status: "pending",
      github_commit_sha: null,
      retry_count: 0,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    });

    // 4. Merkle Tree Genesis & CREATED Event
    const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "unknown";

    await appendAuditLog(documentId, "CREATED", {
      original_sha256,
      original_sha3_512,
      file_size_bytes,
      creator_email: creator_email || "anonymous",
      creator_ml_dsa_public_key_hash: pkHash,
      client_ip: clientIp,
      user_agent: userAgent,
    });

    const responsePayload = {
      document_id: documentId,
      r2_presigned_upload_url: presignedUploadUrl,
      creator_document_token: creatorDocumentToken,
      creator_identity_token: creatorIdentityToken,
      status: "initialized",
    };

    await recordIdempotency(idempotencyKey, "/api/documents/init", 201, responsePayload);

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
