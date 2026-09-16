import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { signSignerSessionToken } from "@/lib/server/jwt";
import { appendAuditLog } from "@/lib/server/merkle";
import { sha256Hex } from "@/lib/crypto/hashes";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenHash = sha256Hex(token);

    const signer = await db.getSignerByTokenHash(tokenHash);
    if (!signer) {
      return NextResponse.json(
        { error: { code: "INVALID_TOKEN", message: "Signer token not found." } },
        { status: 404 }
      );
    }

    if (signer.auth_locked_until && new Date(signer.auth_locked_until).getTime() > Date.now()) {
      return NextResponse.json(
        { error: { code: "ACCOUNT_LOCKED", message: "Account is temporarily locked. Please try again later." } },
        { status: 423 }
      );
    }

    const body = await request.json();
    const { otp_code } = body;

    if (!otp_code) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "OTP code is required." } },
        { status: 400 }
      );
    }

    const providedOtpHash = sha256Hex(otp_code.toString().trim());

    const isExpired = !signer.otp_expires_at || new Date(signer.otp_expires_at).getTime() < Date.now();
    const isMismatch = signer.otp_code_hash !== providedOtpHash;

    if (isExpired || isMismatch) {
      const attempts = (signer.auth_attempts || 0) + 1;
      const willLock = attempts >= 5;
      const lockedUntil = willLock ? new Date(Date.now() + 15 * 60000).toISOString() : null;

      await db.updateSigner(signer.id, {
        auth_attempts: attempts,
        auth_locked_until: lockedUntil,
      });

      if (willLock) {
        return NextResponse.json(
          { error: { code: "ACCOUNT_LOCKED", message: "Too many failed attempts. Locked for 15 minutes." } },
          { status: 423 }
        );
      }

      return NextResponse.json(
        {
          error: {
            code: "INVALID_OTP",
            message: isExpired ? "OTP has expired. Please request a new one." : `Incorrect OTP code. Remaining attempts: ${5 - attempts}`,
          },
        },
        { status: 400 }
      );
    }

    // OTP Verified Successfully!
    const verifiedAt = new Date().toISOString();
    await db.updateSigner(signer.id, {
      identity_auth_verified_at: verifiedAt,
      auth_attempts: 0,
      auth_locked_until: null,
      otp_code_hash: null, // Clear used OTP
    });

    const document = await db.getDocument(signer.document_id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found" } },
        { status: 404 }
      );
    }

    // Append IDENTITY_VERIFIED to Merkle chain
    const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
    await appendAuditLog(document.id, "IDENTITY_VERIFIED", {
      signer_id: signer.id,
      email: signer.email,
      verified_at: verifiedAt,
      client_ip: clientIp,
    });

    // Issue signer session token (3h validity)
    const signerSessionToken = await signSignerSessionToken(
      document.id,
      signer.id,
      signer.email,
      token
    );

    // Generate 15-minute temporary presigned download URL for the encrypted PDF
    const presignedDownloadUrl = await storage.getPresignedDownloadUrl(
      document.encrypted_original_path || `documents/${document.id}/original.enc`,
      900 // 15 mins
    );

    return NextResponse.json({
      verified: true,
      signer_session_token: signerSessionToken,
      r2_presigned_download_url: presignedDownloadUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
