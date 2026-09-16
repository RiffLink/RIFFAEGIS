import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { bytesToHex, hexToBytes } from "@/lib/crypto/hashes";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const urlOrigin = new URL(appUrl).origin;
const expectedOrigins = Array.from(new Set([
  urlOrigin,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]));
const expectedRPID = new URL(appUrl).hostname;

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

export const webauthnConfig = {
  rpName: "RiffAegis Secure Electronic Signature",
  rpID: expectedRPID,
  origin: urlOrigin,
  expectedOrigins,
};

/**
 * Generate WebAuthn registration options for new device binding
 */
export async function generateWebAuthnRegistrationOptions(params: {
  userId: string;
  userName: string;
  userDisplayName?: string;
}) {
  return generateRegistrationOptions({
    rpName: webauthnConfig.rpName,
    rpID: expectedRPID,
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
  expectedChallengeBase64Url: string
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response,
    expectedChallenge: expectedChallengeBase64Url,
    expectedOrigin: expectedOrigins,
    expectedRPID,
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
  }
): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge: expectedChallengeBase64Url,
    expectedOrigin: expectedOrigins,
    expectedRPID,
    credential: {
      id: authenticator.credentialID,
      publicKey: authenticator.credentialPublicKey as unknown as Uint8Array<ArrayBuffer>,
      counter: authenticator.counter,
    },
    requireUserVerification: true,
  });
}
