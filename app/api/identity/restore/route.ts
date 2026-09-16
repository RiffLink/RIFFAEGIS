import { NextRequest, NextResponse } from "next/server";
import { signCreatorIdentityToken } from "@/lib/server/jwt";
import {
  getPublicKeyHash,
  verifyOriginalSignature,
  base64ToBytes,
  sha3_512Hex,
  hmacSha256Hex,
} from "@/lib/crypto";

const CHALLENGE_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "riff-aegis-restore-challenge-hmac-secret-32b"
);
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET: Request a cryptographically authenticated restore challenge
 */
export async function GET() {
  const nonceBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(nonceBytes);
  const nonceHex = Buffer.from(nonceBytes).toString("hex");
  const timestamp = new Date().toISOString();

  // Canonical challenge string formatted as SHA3-512 hex
  const challengeMessage = sha3_512Hex(`RIFFAEGIS_RESTORE:${nonceHex}:${timestamp}`);
  const challengeToken = hmacSha256Hex(CHALLENGE_SECRET, `${challengeMessage}:${timestamp}`);

  return NextResponse.json({
    challenge_message: challengeMessage,
    challenge_token: challengeToken,
    timestamp,
    expires_in_seconds: 300,
  });
}

/**
 * POST: Authenticate using restored ML-DSA-65 post-quantum key
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      creator_ml_dsa_public_key, // base64
      challenge_signature,       // base64
      challenge_message,         // string (SHA3-512)
      challenge_token,           // string (HMAC verification)
      timestamp,                 // ISO string
    } = body;

    // 1. Validate mandatory fields
    if (!creator_ml_dsa_public_key || !challenge_signature || !challenge_message) {
      return NextResponse.json(
        {
          error: {
            code: "CHALLENGE_SIGNATURE_REQUIRED",
            message: "Cryptographic proof of ML-DSA private key possession is required for identity restore.",
          },
        },
        { status: 401 }
      );
    }

    // 2. Validate timestamp and server challenge token if provided
    if (timestamp && challenge_token) {
      const challengeAge = Date.now() - new Date(timestamp).getTime();
      if (challengeAge > CHALLENGE_EXPIRY_MS || challengeAge < -30000) {
        return NextResponse.json(
          { error: { code: "CHALLENGE_EXPIRED", message: "Challenge has expired. Please request a new one." } },
          { status: 401 }
        );
      }

      const expectedToken = hmacSha256Hex(CHALLENGE_SECRET, `${challenge_message}:${timestamp}`);
      if (challenge_token !== expectedToken) {
        return NextResponse.json(
          { error: { code: "INVALID_CHALLENGE_TOKEN", message: "Challenge token tampering detected." } },
          { status: 401 }
        );
      }
    }

    const pkBytes = base64ToBytes(creator_ml_dsa_public_key);
    const sigBytes = base64ToBytes(challenge_signature);
    const pkHash = getPublicKeyHash(pkBytes);

    // 3. Mathematical Verification of ML-DSA-65 signature against challenge
    const isValidSignature = verifyOriginalSignature(sigBytes, challenge_message, pkBytes);
    if (!isValidSignature) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_SIGNATURE",
            message: "ML-DSA-65 signature verification failed. Private key mismatch or corrupted signature.",
          },
        },
        { status: 401 }
      );
    }

    // 4. Issue authenticated creator identity token
    const creatorIdentityToken = await signCreatorIdentityToken(pkHash);

    return NextResponse.json({
      creator_identity_token: creatorIdentityToken,
      creator_ml_dsa_public_key_hash: pkHash,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
