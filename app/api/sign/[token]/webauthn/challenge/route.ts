import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { extractBearerToken, verifyToken, SignerSessionTokenClaims } from "@/lib/server/jwt";
import { getLatestMerkleRoot } from "@/lib/server/merkle";
import { generateServerNonce, webauthnConfig } from "@/lib/server/webauthn";
import { createSignerWebAuthnChallenge, bytesToBase64Url } from "@/lib/crypto/hashes";

// In-memory challenge store for signer challenges
const globalSignerNonces = globalThis as unknown as { signerNonces?: Map<string, { nonce: Uint8Array; challengeB64Url: string; expiresAt: number }> };
export const signerNonces = globalSignerNonces.signerNonces || new Map<string, { nonce: Uint8Array; challengeB64Url: string; expiresAt: number }>();
if (process.env.NODE_ENV !== "production") globalSignerNonces.signerNonces = signerNonces;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token: _token } = await params;
    const bearerToken = extractBearerToken(request.headers.get("authorization"));
    if (!bearerToken) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } },
        { status: 401 }
      );
    }

    const claims = await verifyToken<SignerSessionTokenClaims>(bearerToken);
    if (claims.role !== "signer") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Unauthorized token." } },
        { status: 403 }
      );
    }

    const document = await db.getDocument(claims.document_id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    // 1. Fetch latest Merkle Node Hash
    const latestMerkleRoot = await getLatestMerkleRoot(document.id);

    // 2. Generate server nonce
    const { nonceBytes, nonceHex } = generateServerNonce();

    // 3. Compute challenge = HMAC-SHA-256(server_nonce, latest_merkle_node_hash)
    const challengeBytes = createSignerWebAuthnChallenge(nonceBytes, latestMerkleRoot);
    const challengeB64Url = bytesToBase64Url(challengeBytes);

    // 4. Save nonce in DB and in-memory cache
    await db.updateSigner(claims.signer_id, {
      webauthn_challenge_nonce: nonceHex,
    });

    signerNonces.set(claims.signer_id, {
      nonce: nonceBytes,
      challengeB64Url,
      expiresAt: Date.now() + 300000, // 5 mins
    });

    const body = await request.json().catch(() => ({}));
    const authLevel = body.auth_level || "high_webauthn";

    const authenticatorSelection: {
      userVerification: "preferred";
      residentKey: "preferred";
      authenticatorAttachment?: "platform" | "cross-platform";
    } = {
      userVerification: "preferred",
      residentKey: "preferred",
    };

    if (authLevel === "high_webauthn") {
      authenticatorSelection.authenticatorAttachment = "platform";
    } else if (authLevel === "medium_security_key") {
      authenticatorSelection.authenticatorAttachment = "cross-platform";
    }

    return NextResponse.json({
      challenge: challengeB64Url,
      rp: {
        name: webauthnConfig.rpName,
        id: webauthnConfig.rpID,
      },
      user: {
        id: claims.signer_id,
        name: claims.email_verified,
        displayName: claims.email_verified,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },  // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection,
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
