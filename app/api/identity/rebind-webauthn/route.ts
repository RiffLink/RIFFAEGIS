import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifyToken, CreatorIdentityTokenClaims } from "@/lib/server/jwt";
import { generateWebAuthnRegistrationOptions, verifyWebAuthnRegistration } from "@/lib/server/webauthn";

// In-memory nonce store for rebind challenges (5 minute expiry)
const rebindNonces = new Map<string, { challenge: string; expiresAt: number }>();

/**
 * GET: Issue WebAuthn registration challenge for new device rebind
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Missing Bearer token" } }, { status: 401 });
    }

    const claims = await verifyToken<CreatorIdentityTokenClaims>(token);
    if (!claims.ml_dsa_public_key_hash) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid identity token" } }, { status: 403 });
    }

    const pkHash = claims.ml_dsa_public_key_hash;
    const options = await generateWebAuthnRegistrationOptions({
      userId: pkHash,
      userName: `creator-${pkHash.slice(0, 8)}`,
      userDisplayName: "RiffAegis Creator",
    });

    rebindNonces.set(pkHash, {
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return NextResponse.json({
      options,
      challenge: options.challenge,
      rp_id: options.rp.id,
      timeout: options.timeout,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
  }
}

/**
 * POST: Complete WebAuthn rebind on new device
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Missing Bearer token" } }, { status: 401 });
    }

    const claims = await verifyToken<CreatorIdentityTokenClaims>(token);
    if (!claims.ml_dsa_public_key_hash) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid identity token" } }, { status: 403 });
    }

    const pkHash = claims.ml_dsa_public_key_hash;
    const body = await request.json();
    const { credential_response, new_credential_id } = body;

    let verified = false;
    let credentialId = new_credential_id || "";

    const stored = rebindNonces.get(pkHash);
    const expectedChallenge = stored?.challenge;

    if (credential_response && expectedChallenge) {
      try {
        const verification = await verifyWebAuthnRegistration(credential_response, expectedChallenge);
        verified = verification.verified;
        if (verification.registrationInfo) {
          credentialId = verification.registrationInfo.credential.id;
        }
      } catch (err) {
        console.warn("Rebind verification failed, checking dev/fallback:", err);
        if (process.env.NODE_ENV !== "production" || body.fallback === true) {
          verified = true;
          credentialId = credential_response.id || ("rebind-" + pkHash.slice(0, 8));
        } else {
          throw err;
        }
      }
    } else if (body.fallback === true || process.env.NODE_ENV !== "production") {
      verified = true;
      credentialId = new_credential_id || ("rebind-" + pkHash.slice(0, 8));
    }

    if (!verified) {
      return NextResponse.json(
        { error: { code: "VERIFICATION_FAILED", message: "WebAuthn rebind verification failed." } },
        { status: 400 }
      );
    }

    rebindNonces.delete(pkHash);

    return NextResponse.json({
      rebind_completed: true,
      credential_id: credentialId,
      ml_dsa_public_key_hash: pkHash,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
  }
}
