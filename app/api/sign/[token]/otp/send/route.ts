import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { emailService } from "@/lib/server/email";
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
      const waitMin = Math.ceil((new Date(signer.auth_locked_until).getTime() - Date.now()) / 60000);
      return NextResponse.json(
        { error: { code: "ACCOUNT_LOCKED", message: `Authentication temporarily locked due to repeated failures. Try again in ${waitMin} minutes.` } },
        { status: 423 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (body.email && body.email.trim().toLowerCase() !== signer.email.trim().toLowerCase()) {
      return NextResponse.json(
        {
          error: {
            code: "EMAIL_MISMATCH",
            message: "Provided email does not match the registered signer email address for this document.",
          },
        },
        { status: 403 }
      );
    }

    const targetEmail = signer.email;

    // Generate 6-digit numeric OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = sha256Hex(otpCode);
    const otpExpiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 minutes

    await db.updateSigner(signer.id, {
      otp_code_hash: otpHash,
      otp_expires_at: otpExpiresAt,
    });

    const ipAddress = request.headers.get("x-forwarded-for") || "127.0.0.1";
    await emailService.sendOtpEmail({
      toEmail: targetEmail,
      otpCode,
      expiresInMinutes: 10,
      ipAddress,
    });

    return NextResponse.json({
      otp_sent: true,
      expires_in_seconds: 600,
      // Debug helper for non-production tests
      ...(process.env.NODE_ENV !== "production" ? { debug_otp: otpCode } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
