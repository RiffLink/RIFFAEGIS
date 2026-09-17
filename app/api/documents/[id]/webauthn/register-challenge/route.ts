import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { extractBearerToken, verifyToken, CreatorDocumentTokenClaims } from "@/lib/server/jwt";
import { generateServerNonce, getWebAuthnConfig } from "@/lib/server/webauthn";
import { createCreatorWebAuthnChallenge, bytesToBase64Url } from "@/lib/crypto/hashes";

// In-memory challenge store for nonces during registration
const globalNonces = globalThis as unknown as { creatorNonces?: Map<string, { nonce: Uint8Array; challengeB64Url: string; expiresAt: number }> };
export const creatorNonces = globalNonces.creatorNonces || new Map<string, { nonce: Uint8Array; challengeB64Url: string; expiresAt: number }>();
if (process.env.NODE_ENV !== "production") globalNonces.creatorNonces = creatorNonces;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Bearer token" } },
        { status: 401 }
      );
    }

    const claims = await verifyToken<CreatorDocumentTokenClaims>(token);
    if (claims.document_id !== id) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Unauthorized token" } },
        { status: 403 }
      );
    }

    const document = await db.getDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found" } },
        { status: 404 }
      );
    }

    const { nonceBytes } = generateServerNonce();
    const pkBytes = typeof document.creator_ml_dsa_public_key === "string"
      ? Buffer.from(document.creator_ml_dsa_public_key, "hex")
      : document.creator_ml_dsa_public_key;

    const challengeBytes = createCreatorWebAuthnChallenge(
      nonceBytes,
      document.original_sha256,
      pkBytes
    );
    const challengeB64Url = bytesToBase64Url(challengeBytes);

    creatorNonces.set(id, {
      nonce: nonceBytes,
      challengeB64Url,
      expiresAt: Date.now() + 300000, // 5 mins
    });

    const meta = (document.creator_webauthn_binding || {}) as Record<string, unknown>;
    // Persist nonce in document record to survive serverless instance hopping
    await db.updateDocument(id, {
      creator_webauthn_binding: {
        ...meta,
        creator_challenge_nonce: Buffer.from(nonceBytes).toString("hex"),
        creator_challenge_expires_at: Date.now() + 300000,
      },
    });

    const creatorEmail = (meta.creator_email as string) || "creator";
    const docShortId = id.slice(0, 8);
    const userName = `${creatorEmail} (${docShortId})`;
    const displayName = (meta.creator_name as string) || "Document Creator";
    const cfg = getWebAuthnConfig(request);

    return NextResponse.json({
      challenge: challengeB64Url,
      rp: {
        name: cfg.rpName,
        id: cfg.rpID,
      },
      user: {
        id: Buffer.from(id).toString("base64url"),
        name: userName,
        displayName: displayName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256 (Common for Touch ID / Face ID)
        { alg: -257, type: "public-key" }, // RS256
        { alg: -8, type: "public-key" },   // Ed25519
        { alg: -37, type: "public-key" },  // PS256
      ],
      authenticatorSelection: {
        userVerification: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
