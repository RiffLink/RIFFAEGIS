import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { extractBearerToken, verifyToken, CreatorDocumentTokenClaims } from "@/lib/server/jwt";
import { sha256Hex, bytesToBase64Url } from "@/lib/crypto/hashes";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } },
        { status: 401 }
      );
    }

    const claims = await verifyToken<CreatorDocumentTokenClaims>(token);
    if (claims.document_id !== id) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Unauthorized token." } },
        { status: 403 }
      );
    }

    const document = await db.getDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    const body = await request.json();
    if (!body.keystore_backup_confirmed) {
      return NextResponse.json(
        {
          error: {
            code: "KEYSTORE_BACKUP_REQUIRED",
            message: "Mandatory .riffkey backup must be confirmed before activating signature URL.",
          },
        },
        { status: 400 }
      );
    }

    if (!document.upload_confirmed) {
      return NextResponse.json(
        {
          error: {
            code: "UPLOAD_NOT_CONFIRMED",
            message: "Original document upload must be confirmed before activation.",
          },
        },
        { status: 400 }
      );
    }

    const existingBinding = (document.creator_webauthn_binding || {}) as Record<string, unknown>;

    // Check if signers already exist in database to prevent double activation from concurrent requests
    const existingSigners = await db.listSignersByDocument(id);
    if (existingSigners.length > 0 && existingBinding.first_signer_token) {
      const firstToken = existingBinding.first_signer_token as string;
      const signingUrlTemplate = `${appUrl}/sign/${firstToken}#{key}`;

      // Deduplicate by email to calculate accurate total signers
      const uniqueEmails = Array.from(new Set(existingSigners.map((s) => s.email.toLowerCase())));

      return NextResponse.json({
        status: "pending",
        signing_token: firstToken,
        first_signer_token: firstToken,
        signing_url_template: signingUrlTemplate,
        total_signers: uniqueEmails.length,
        already_activated: true,
      });
    }

    const rawSignersInput = Array.isArray(body.signers) && body.signers.length > 0
      ? body.signers
      : [{ email: body.signer_email || "unspecified@signer.local", role: "signer" }];

    // Deduplicate input signers by email to guarantee each person is only registered once
    const uniqueSignersMap = new Map<string, any>();
    for (const s of rawSignersInput) {
      const emailKey = (s.email || "").trim().toLowerCase();
      if (emailKey && !uniqueSignersMap.has(emailKey)) {
        uniqueSignersMap.set(emailKey, s);
      }
    }
    const rawSigners = uniqueSignersMap.size > 0
      ? Array.from(uniqueSignersMap.values())
      : rawSignersInput;

    const tokenExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString(); // 7 days
    let firstSignerToken = "";

    // Clear any previous un-signed duplicate rows before inserting fresh ones
    await db.deleteSignersByDocument(id);

    for (let i = 0; i < rawSigners.length; i++) {
      const s = rawSigners[i];
      const tokenBytes = new Uint8Array(32);
      globalThis.crypto.getRandomValues(tokenBytes);
      const tokenStr = bytesToBase64Url(tokenBytes);
      const tokenHash = sha256Hex(tokenStr);

      if (i === 0) {
        firstSignerToken = tokenStr;
      }

      await db.insertSigner({
        id: crypto.randomUUID(),
        document_id: id,
        signing_order: i + 1,
        role: s.role || "signer",
        email: s.email || "unspecified@signer.local",
        identity_auth_type: "email_otp",
        identity_auth_verified_at: null,
        auth_token_hash: tokenHash,
        token_expires_at: tokenExpiresAt,
        otp_code_hash: null,
        otp_expires_at: null,
        auth_attempts: 0,
        auth_locked_until: null,
        webauthn_credential_id: null,
        webauthn_public_key: null,
        webauthn_challenge_nonce: null,
        attestation_object: null,
        client_data_json: null,
        auth_level: null,
        signed_at: null,
      });
    }

    // Persist status, creator-accessible first signer token, and full signer fields
    await db.updateDocument(id, {
      status: "pending",
      creator_webauthn_binding: {
        ...existingBinding,
        first_signer_token: firstSignerToken,
        signer_fields: rawSigners,
      },
    });

    const signingUrlTemplate = `${appUrl}/sign/${firstSignerToken}#{key}`;

    return NextResponse.json({
      status: "pending",
      signing_token: firstSignerToken,
      first_signer_token: firstSignerToken,
      signing_url_template: signingUrlTemplate,
      total_signers: rawSigners.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
