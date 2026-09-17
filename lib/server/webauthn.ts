import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { bytesToHex, hexToBytes } from "@/lib/crypto/hashes";
import { NextRequest } from "next/server";

/**
 * Dynamically extract WebAuthn RP ID and allowed origins based on the current incoming request
 * This guarantees that whether accessed via aegis.rifflink.com, localhost, or preview domains,
 * the rpID always matches the browser's exact hostname, preventing WebAuthn SecurityError.
 */
export function getWebAuthnConfig(request?: Request | NextRequest) {
  let host = "";
  let protocol = "https:";
  let origin = "";

  if (request) {
    const rawOrigin = request.headers.get("origin") || request.headers.get("referer");
    if (rawOrigin) {
      try {
        const u = new URL(rawOrigin);
        origin = u.origin;
        host = u.hostname;
        protocol = u.protocol;
      } catch {
        // ignore parse error
      }
    }
    if (!host) {
      const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
      if (forwardedHost) {
        host = forwardedHost.split(":")[0];
        const forwardedProto = request.headers.get("x-forwarded-proto");
        if (forwardedProto) protocol = forwardedProto.endsWith(":") ? forwardedProto : `${forwardedProto}:`;
        origin = `${protocol}//${forwardedHost}`;
      }
    }
  }

  if (!host) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aegis.rifflink.com";
    try {
      const u = new URL(appUrl);
      host = u.hostname;
      origin = u.origin;
    } catch {
      host = "aegis.rifflink.com";
      origin = "https://aegis.rifflink.com";
    }
  }

  const originsSet = new Set<string>([
    origin,
    `https://${host}`,
    `http://${host}`,
    "https://aegis.rifflink.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      originsSet.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {}
  }

  const expectedOrigins = Array.from(originsSet).filter(Boolean);

  return {
    rpName: "RiffAegis Secure Electronic Signature",
    rpID: host,
    origin,
    expectedOrigins,
  };
}

export const webauthnConfig = getWebAuthnConfig();

/**
 * Generate a cryptographically secure 32-byte server random nonce in hex
 */
export function generateServerNonce(): { nonceBytes: Uint8Array; nonceHex: string } {
  const nonceBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(nonceBytes);
  return {
    nonceBytes,
    nonceHex: bytesToHex(nonceBytes),
  };
}

export { hexToBytes as serverHexToBytes };

/**
 * Generate WebAuthn registration options for new device binding
 */
export async function generateWebAuthnRegistrationOptions(params: {
  userId: string;
  userName: string;
  userDisplayName?: string;
  request?: Request | NextRequest;
}) {
  const cfg = getWebAuthnConfig(params.request);
  return generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    userID: new TextEncoder().encode(params.userId),
    userName: params.userName,
    userDisplayName: params.userDisplayName || params.userName,
    attestationType: "none",
    authenticatorSelection: {
      userVerification: "preferred",
    },
  });
}

/**
 * Verify WebAuthn registration attestation response
 */
export async function verifyWebAuthnRegistration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
  expectedChallengeBase64Url: string,
  request?: Request | NextRequest
): Promise<VerifiedRegistrationResponse> {
  const cfg = getWebAuthnConfig(request);
  return verifyRegistrationResponse({
    response,
    expectedChallenge: expectedChallengeBase64Url,
    expectedOrigin: cfg.expectedOrigins,
    expectedRPID: cfg.rpID,
    requireUserVerification: false,
  });
}

/**
 * Verify WebAuthn authentication assertion response
 */
export async function verifyWebAuthnAuthentication(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
  expectedChallengeBase64Url: string,
  authenticator: {
    credentialID: string;
    credentialPublicKey: Uint8Array;
    counter: number;
  },
  request?: Request | NextRequest
): Promise<VerifiedAuthenticationResponse> {
  const cfg = getWebAuthnConfig(request);
  return verifyAuthenticationResponse({
    response,
    expectedChallenge: expectedChallengeBase64Url,
    expectedOrigin: cfg.expectedOrigins,
    expectedRPID: cfg.rpID,
    credential: {
      id: authenticator.credentialID,
      publicKey: authenticator.credentialPublicKey as unknown as Uint8Array<ArrayBuffer>,
      counter: authenticator.counter,
    },
    requireUserVerification: true,
  });
}
